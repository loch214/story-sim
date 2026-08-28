import { NextResponse } from 'next/server';
import { z } from 'zod';
import { geminiConfig } from '@/lib/env';
import { configFailure, failureResponse, generateJson, type GeminiUsage } from '@/lib/gemini';
import { chapterSchemaFor } from '@/lib/geminiSchema';
import { normaliseChapter } from '@/lib/normalise';
import { buildChapterPrompt } from '@/lib/prompts';
import {
  chapterDigestSchema,
  chapterResponseSchema,
  PREFLIGHT_MODES,
  worldCanonSchema,
  type ChapterResponse,
} from '@/lib/types';
import { validateChapter } from '@/lib/validate';

// A full chapter measured 40s in Spike 0. Hobby allows 300.
export const maxDuration = 300;

const MAX_OUTPUT_TOKENS = 32_768;

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
  })
  .refine((body) => body.chapterNumber === 1 || (body.styleBible && body.worldCanon), {
    message: 'Chapter 2 and later need the frozen styleBible and the prior worldCanon.',
  });

export async function POST(request: Request) {
  const parsedRequest = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsedRequest.success) {
    return NextResponse.json(
      { error: 'bad_request', message: parsedRequest.error.issues[0]?.message ?? 'Invalid request.' },
      { status: 400 },
    );
  }
  const input = parsedRequest.data;

  let config;
  try {
    config = geminiConfig();
  } catch (cause) {
    const { status, body } = failureResponse(configFailure(cause));
    return NextResponse.json(body, { status });
  }

  const schema = chapterSchemaFor(input.chapterNumber);
  let lastViolations: string[] = [];
  let lastRaw = '';
  let usage: GeminiUsage | undefined;

  // One retry, carrying the violation list. A partial list would waste it.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const result = await generateJson({
      apiKey: config.apiKey,
      model: config.chapterModel,
      prompt: buildChapterPrompt({
        rule: input.rule,
        chapterNumber: input.chapterNumber,
        mode: input.mode,
        styleBible: input.styleBible,
        worldCanon: input.worldCanon,
        chapterDigests: input.chapterDigests,
        violations: attempt === 1 ? undefined : lastViolations,
      }),
      schema,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      thinking: true,
    });

    if (!result.ok) {
      // Quota and safety failures do not improve on a retry.
      if (result.failure.kind === 'malformed' || result.failure.kind === 'truncated') {
        lastViolations = [
          result.failure.kind === 'truncated'
            ? 'The previous response was cut off. Be more concise so the whole chapter fits.'
            : 'The previous response was not valid JSON.',
        ];
        lastRaw = result.raw ?? '';
        if (attempt === 1) continue;
      }
      const { status, body } = failureResponse(result.failure);
      return NextResponse.json({ ...body, raw: lastRaw || undefined }, { status });
    }

    usage = result.usage;
    lastRaw = result.raw;

    const parsed = chapterResponseSchema.safeParse(result.value);
    if (!parsed.success) {
      lastViolations = parsed.error.issues.map((issue) => `Shape: ${issue.path.join('.')} — ${issue.message}`);
      if (attempt === 1) continue;
      return NextResponse.json(
        { error: 'invalid_chapter', violations: lastViolations, raw: lastRaw },
        { status: 422 },
      );
    }

    const { chapter, report } = normaliseChapter(parsed.data, input.rule);
    const violations = validateChapter(chapter, {
      chapterNumber: input.chapterNumber,
      priorCanon: input.worldCanon,
      mode: input.mode,
      worldStyleBible: input.styleBible,
    });

    if (violations.length === 0) {
      return NextResponse.json({
        chapter: chapter satisfies ChapterResponse,
        usage,
        attempts: attempt,
        strippedTokens: report.strippedTokens,
      });
    }

    lastViolations = violations;
    if (attempt === 2) {
      return NextResponse.json(
        { error: 'invalid_chapter', violations, raw: lastRaw },
        { status: 422 },
      );
    }
  }

  return NextResponse.json(
    { error: 'invalid_chapter', violations: lastViolations, raw: lastRaw },
    { status: 422 },
  );
}
