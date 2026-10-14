import { NextResponse } from 'next/server';
import { z } from 'zod';
import { geminiConfig } from '@/lib/env';
import {
  configFailure,
  failureResponse,
  generateJson,
  generateText,
  type GeminiUsage,
} from '@/lib/gemini';
import { platesSchemaFor } from '@/lib/geminiSchema';
import { normaliseChapter } from '@/lib/normalise';
import { buildPlatesPrompt, buildStoryPrompt, parseStory, type ParsedStory } from '@/lib/prompts';
import {
  chapterDigestSchema,
  PAGES,
  platesResponseSchema,
  PREFLIGHT_MODES,
  worldCanonSchema,
  type ChapterResponse,
  type PlatesResponse,
} from '@/lib/types';
import { validateChapter } from '@/lib/validate';

// Two thinking calls, each with one possible retry, each able to walk the
// model fallback list. Hobby allows 300.
export const maxDuration = 300;

const STORY_MAX_OUTPUT_TOKENS = 16_384;
const PLATES_MAX_OUTPUT_TOKENS = 32_768;

/**
 * A finished story, handed back to the client when step 2 fails and sent
 * again on "try again" — so a busy picture-planning step does not throw away
 * the story and spend more of the day's requests writing a new one.
 */
const draftSchema = z.object({
  /** The model that wrote it, carried through to the stored chapter. */
  model: z.string().min(1),
  story: z.object({
    title: z.string().optional(),
    summary: z.string().min(1),
    heroRole: z.string().min(1),
    plan: z.string().optional(),
    pages: z.array(z.string().min(1)).min(PAGES.min).max(PAGES.max),
  }),
});

type StoryDraft = z.infer<typeof draftSchema>;

const NO_USAGE: GeminiUsage = { promptTokens: 0, outputTokens: 0, thinkingTokens: 0 };

const requestSchema = z
  .object({
    rule: z.string().min(1).max(300),
    chapterNumber: z.number().int().min(1),
    /**
     * Which pipeline to run, decided at pre-flight. Optional so an older client
     * — or a hand-rolled request — still gets the derived world it expects.
     */
    mode: z.enum(PREFLIGHT_MODES).default('rule'),
    styleBible: z.string().optional(),
    worldCanon: worldCanonSchema.optional(),
    chapterDigests: z.array(chapterDigestSchema).optional(),
    /** Present on "try again" after step 2 failed: skip straight to the plates. */
    draft: draftSchema.optional(),
  })
  .refine((body) => body.chapterNumber === 1 || (body.styleBible && body.worldCanon), {
    message: 'Chapter 2 and later need the frozen styleBible and the prior worldCanon.',
  });

type Input = z.infer<typeof requestSchema>;
type Config = ReturnType<typeof geminiConfig>;

/**
 * A chapter is two calls. The story is written first, as prose, with nothing to
 * satisfy but a page count; then the plates and the world record are built from
 * it as JSON. Each step has its own single retry, so a structural fault in step
 * 2 is repaired without rewriting the story. See lib/prompts.ts.
 */
export async function POST(request: Request) {
  const parsedRequest = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsedRequest.success) {
    return NextResponse.json(
      { error: 'bad_request', message: parsedRequest.error.issues[0]?.message ?? 'Invalid request.' },
      { status: 400 },
    );
  }
  const input = parsedRequest.data;

  let config: Config;
  try {
    config = geminiConfig();
  } catch (cause) {
    const { status, body } = failureResponse(configFailure(cause));
    return NextResponse.json(body, { status });
  }

  if (input.draft) {
    return buildPlates(input, config, input.draft, NO_USAGE);
  }

  const written = await writeStory(input, config);
  if (!written.ok) return written.response;

  // Each call walks the model list from the top rather than staying on
  // whichever model wrote the story: a fallback can take minutes per call
  // (gemini-3.8-flash: 65s for one sentence), and the main model is often
  // free again by the time step 2 starts.
  return buildPlates(input, config, { story: written.story, model: written.model }, written.usage);
}

async function writeStory(
  input: Input,
  config: Config,
): Promise<
  { ok: true; story: ParsedStory; usage: GeminiUsage; model: string } | { ok: false; response: NextResponse }
> {
  const first = input.chapterNumber === 1;
  let problems: string[] = [];
  let lastRaw = '';

  for (let attempt = 1; attempt <= 2; attempt++) {
    const result = await generateText({
      apiKey: config.apiKey,
      models: config.chapterModels,
      lastResort: config.lastResortModels,
      prompt: buildStoryPrompt({ ...input, problems: attempt === 1 ? undefined : problems }),
      maxOutputTokens: STORY_MAX_OUTPUT_TOKENS,
      thinking: true,
    });

    if (!result.ok) {
      // Quota and safety failures do not improve on a retry.
      if (result.failure.kind === 'truncated' && attempt === 1) {
        problems = ['The previous response was cut off. Keep every page shorter.'];
        continue;
      }
      const { status, body } = failureResponse(result.failure);
      return { ok: false, response: NextResponse.json(body, { status }) };
    }

    lastRaw = result.text;
    const parsed = parseStory(result.text, { first });
    if (parsed.ok) return { ok: true, story: parsed.story, usage: result.usage, model: result.model };
    problems = parsed.problems;
  }

  return {
    ok: false,
    response: NextResponse.json(
      {
        error: 'invalid_story',
        message: 'The story came back in a shape the book could not use, twice.',
        violations: problems,
        raw: lastRaw,
      },
      { status: 422 },
    ),
  };
}

/** Joins the story pass's prose onto step 2's plates. Text comes from the story, always. */
function mergeChapter(plates: PlatesResponse, story: ParsedStory, first: boolean): ChapterResponse {
  const byIndex = new Map(plates.pages.map((p) => [p.index, p]));
  const pages = story.pages.map((text, i) => {
    const plate = byIndex.get(i + 1);
    return plate
      ? { ...plate, text }
      : // A missing plate keeps its text and fails rules 3 and 13 with a
        // message naming the page, which is what the retry needs.
        { index: i + 1, text, derivedFrom: '', shotType: 'medium' as const, imagePrompt: '', entityRefs: [], altText: '' };
  });
  return {
    ...plates,
    pages,
    summary: story.summary,
    plan: story.plan,
    ...(first ? { worldTitle: story.title ?? '' } : {}),
  };
}

/**
 * Every failure here carries `draft` — the finished story — so the client can
 * send it back on "try again" and only this step runs again.
 */
async function buildPlates(
  input: Input,
  config: Config,
  draft: StoryDraft,
  storyUsage: GeminiUsage,
) {
  const first = input.chapterNumber === 1;
  const { story } = draft;
  const schema = platesSchemaFor(input.chapterNumber);
  let lastViolations: string[] = [];
  let lastRaw = '';

  for (let attempt = 1; attempt <= 2; attempt++) {
    const result = await generateJson({
      apiKey: config.apiKey,
      models: config.chapterModels,
      lastResort: config.lastResortModels,
      prompt: buildPlatesPrompt({ ...input, story, violations: attempt === 1 ? undefined : lastViolations }),
      schema,
      maxOutputTokens: PLATES_MAX_OUTPUT_TOKENS,
      thinking: true,
    });

    if (!result.ok) {
      if (result.failure.kind === 'malformed' || result.failure.kind === 'truncated') {
        lastViolations = [
          result.failure.kind === 'truncated'
            ? 'The previous response was cut off. Be more concise so the whole response fits.'
            : 'The previous response was not valid JSON.',
        ];
        lastRaw = result.raw ?? '';
        if (attempt === 1) continue;
      }
      const { status, body } = failureResponse(result.failure);
      return NextResponse.json({ ...body, raw: lastRaw || undefined, draft }, { status });
    }

    lastRaw = result.raw;

    const parsed = platesResponseSchema.safeParse(result.value);
    if (!parsed.success) {
      lastViolations = parsed.error.issues.map((issue) => `Shape: ${issue.path.join('.')} — ${issue.message}`);
      continue;
    }

    // Chapter 2+ has no styleBible field in its schema; `transitionNote` comes
    // back as an empty string when there is nothing to say.
    const plates: PlatesResponse = {
      ...parsed.data,
      transitionNote: parsed.data.transitionNote?.trim() || undefined,
    };
    const { chapter, report } = normaliseChapter(mergeChapter(plates, story, first), input.rule);
    const violations = validateChapter(chapter, {
      chapterNumber: input.chapterNumber,
      priorCanon: input.worldCanon,
      mode: input.mode,
      worldStyleBible: input.styleBible,
    });

    if (violations.length === 0) {
      return NextResponse.json({
        chapter,
        models: { story: draft.model, plates: result.model },
        usage: {
          story: storyUsage,
          plates: result.usage,
        },
        attempts: attempt,
        strippedTokens: report.strippedTokens,
      });
    }

    lastViolations = violations;
  }

  return NextResponse.json(
    { error: 'invalid_chapter', violations: lastViolations, raw: lastRaw, draft },
    { status: 422 },
  );
}
