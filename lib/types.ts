import { z } from 'zod';

/**
 * Zod covers *shape* — types, enums, required fields. Every numeric cap and
 * semantic rule lives in lib/validate.ts instead, so a bad chapter yields the
 * complete violation list in one pass rather than failing at the first parse
 * error. The retry prompt is only as good as that list.
 */

export const BASELINE = 'present-day Earth, except:' as const;

export const DOMAINS = [
  'society', 'technology', 'economy', 'politics',
  'culture', 'environment', 'conflict', 'science',
] as const;

/**
 * `medium` and `close-up` were added with the story-first rework: a picture
 * book follows somebody, and the original list — aerial, crowd, diagram,
 * incidental-figures — only had words for surveying a place. The old values
 * stay so stored chapters still parse.
 */
export const SHOT_TYPES = [
  'wide', 'medium', 'close-up', 'detail', 'interior',
  'aerial', 'crowd', 'incidental-figures', 'diagram',
] as const;

export const RULE_TYPES = ['additive', 'contradictory', 'ambiguous'] as const;

// ── Limits ────────────────────────────────────────────────────────────────
// Cloudflare accepts 2048 characters, but that is not what Flux reads. The
// reference FLUX.1 [schnell] pipeline encodes at most 256 T5 tokens — roughly
// 1,000–1,100 characters of English — and silently drops the rest. Prompts
// used to run to ~1,700 characters with the visual laws near the end, which is
// the most likely reason "a world without men" kept drawing men: the law that
// said otherwise was in the part that got cut. Everything is now budgeted so
// the parts that decide what is IN the picture land early, and anything that
// might be clipped is style. See docs/SCHEMA.md § Image prompt assembly.

export const PROMPT_LIMITS = {
  /** The endpoint's hard limit. Nothing we assemble comes near it now. */
  total: 2048,
  /**
   * What assembly aims to stay under. Every hard cap filled — a recurring
   * person and a place — with a legacy 320-character styleBible lands at 1499,
   * a new world's at 1419; typical plates land under 1000. Past ~1050 the encoder
   * may clip, which is why the order puts the styleBible and composition
   * clause last: if anything is lost, it is a few words of style, never the
   * scene, the hero, a recurring person or a law.
   */
  assembled: 1500,
  /**
   * 240 for new worlds. Worlds created before the rework keep their frozen
   * 320-character styleBible; the assembly budget allows for it.
   */
  styleBible: 240,
  /**
   * Asked for in the prompt; the validator allows up to the Max. Ages made
   * descriptions longer, and a 110 hard cap failed a whole chapter three times
   * over descriptions of 113–118 characters.
   */
  entityDescription: 110,
  entityDescriptionMax: 140,
  /**
   * Two: a recurring person beside the hero (the little sister) plus the place.
   * With one, the sister lost the slot to the sorting office on every indoor
   * page and was redrawn in whatever the scene said that time.
   */
  entityRefsPerPage: 2,
  /**
   * The scene: what this page's text is showing. 400, not 900 — a 900-character
   * scene alone filled most of what the encoder reads, which pushed the laws
   * and the style off the end.
   */
  imagePrompt: 400,
  /** How the main character looks, spliced into every plate they are on. */
  heroLook: 140,
  /** Asked for; a 71-character law once failed a chapter. The validator allows the Max. */
  visualLaw: 70,
  visualLawMax: 90,
  /** How many laws ride on one prompt. Matches the canon cap; both ends stay in step. */
  visualLawsPerPrompt: 3,
} as const;

export const CANON_CAPS = {
  activeRules: 6,
  physicsDeltas: 6,
  invariants: 8,
  namedEntities: 10,
  liveTensions: 5,
  supersededRules: 4,
  visualLaws: 3,
  neverDrawn: 30,
} as const;

/**
 * Diffusion models do not do negation, and Flux Schnell has no negative-prompt
 * parameter — the whole input surface is `prompt` and `steps`. A visual law that
 * says what is *absent* therefore summons the thing it forbids: "no men in the
 * crowd" puts "men" and "crowd" in front of the model and nothing else.
 *
 * Every law must say what IS on screen. The validator rejects these openers.
 */
export const NEGATION_PATTERN =
  /\b(no|not|never|without|absent|lacking|devoid|none|nobody|no one|nothing|neither|nor|excluding|removed|banned|forbidden|extinct|vanished|disappeared)\b/i;

/**
 * Twelve to fifteen pages. The story writer decides how many it needs to finish
 * properly — a hard twelve made endings arrive mid-scene. The reader, the
 * render pool and the export all count `pages.length`, never a constant.
 */
export const PAGES = { min: 12, max: 15 } as const;
/**
 * How many movements a chapter's arc may have. The model picks the number and
 * the names to fit the story. The validator enforces only that they tile the
 * pages.
 */
export const ARC_MOVEMENTS = { min: 2, max: 5 } as const;
/**
 * The prompt asks for a label of at most TARGET words; the validator rejects
 * only past MAX. A 7-word label once failed a whole chapter after its one
 * retry — a reader-side heading is not worth a chapter.
 */
export const MOVEMENT_LABEL_TARGET_WORDS = 6;
export const MOVEMENT_LABEL_MAX_WORDS = 10;

/**
 * The scene's floor. A plate whose scene is a dozen words is drawn as the
 * styleBible and nothing else, which is how every plate once looked alike.
 * The prompt asks for TARGET; the validator rejects only below MIN — a floor
 * at 150 failed a whole chapter over scenes of 117–145 characters that were
 * complete pictures.
 */
export const SCENE_CHARS_TARGET = 150;
export const SCENE_CHARS_MIN = 80;

/**
 * The main character has to be in the pictures, not just the text, or the
 * reader is following somebody the illustrations never show. Half the pages,
 * rounded up.
 */
export const HERO_PAGES_MIN_SHARE = 0.5;

/**
 * Generic words for people. Where a world's rule changes WHO exists ("a world
 * without men"), Flux fills "people", "a crowd" or "commuters" from the
 * present-day world — so in such a world every person in an image prompt has
 * to be named in law-consistent words. See rule 24.
 */
export const VAGUE_PEOPLE_PATTERN =
  /\b(?:people|persons?|figures?|crowds?|someone|somebody|everyone|everybody|passers-?by|pedestrians|commuters|workers|villagers|townsfolk|locals|strangers|neighbou?rs|shoppers|customers|onlookers|spectators|adults|children|kids|parents|families|couples?|teenagers|students|staff|crew|passengers)\b/i;
/** Words that pin down who a person is, so a vague word beside them is harmless. */
/**
 * A description that says how old somebody is. hero.look and person entities
 * must match it: "a tall slender girl" with no age was drawn as a grown woman on
 * some pages and a teenager on others.
 */
const AGE_NUMBER =
  '(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)';
export const AGE_PATTERN = new RegExp(
  [
    '\\d',
    '\\b(?:baby|babies|infant|toddler|teen|teens|teenage|teenager|elderly|young|middle-aged|grown|adult|aged)\\b',
    // Words that already fix an age band. "Girl", "boy" and "child" do not —
    // they span five to nineteen, which is the ambiguity this rule is for.
    '\\b(?:wom[ae]n|lady|ladies|mothers?|grandmothers?|grandmas?|granny|aunts?|m[ae]n|fathers?|grandfathers?|grandpas?|uncles?)\\b',
    '\\b(?:twenties|thirties|forties|fifties|sixties|seventies|eighties|nineties)\\b',
    `\\bof\\s+${AGE_NUMBER}\\b`,
    `\\b${AGE_NUMBER}[- ]years?[- ]old\\b`,
  ].join('|'),
  'i',
);
export const EXPLICIT_PEOPLE_PATTERN =
  /\b(?:wom[ae]n|m[ae]n|girls?|boys?|ladies|lady|gentlem[ae]n|grandmothers?|grandfathers?|grandmas?|grandpas?|mothers?|fathers?|sisters?|brothers?|daughters?|sons?|aunts?|uncles?|wi(?:fe|ves)|husbands?|nuns?|monks?)\b/i;
/**
 * When `neverDrawn` contains any of these, the rule has changed who exists and
 * rule 24 switches on.
 */
export const PERSON_WORD_PATTERN =
  /^(?:wom[ae]n|m[ae]n|girls?|boys?|male|males|female|females|he|she|him|her|his|hers|adults?|child|children|kids?|elderly|old|baby|babies|humans?|people|person)$/i;

/** Story pass: words per page. Wide on purpose — a picture book can turn on four words. */
export const PAGE_WORDS = { min: 5, max: 90 } as const;

export const EFFECTS_PER_ORDER = 4;
export const MIN_DISTINCT_SHOT_TYPES = 3;
export const EFFECT_MAX_WORDS = 25;
export const WORLD_TITLE_MAX_WORDS = 6;
export const TRANSITION_NOTE_MAX_WORDS = 40;
export const CHAPTER_DIGEST_CAP = 6;
export const IMAGE_STEPS = 4;
/** Measured, not derived: the `cf-ai-neurons` header for one 1024×1024 plate at 4 steps. */
export const NEURONS_PER_PLATE = 172.8;
export const DAILY_NEURON_ALLOWANCE = 10_000;

// ── Generation contract ───────────────────────────────────────────────────

export const refSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('rule') }),
  z.object({ kind: z.literal('effect'), id: z.string().min(1) }),
  z.object({ kind: z.literal('invariant'), index: z.number().int().min(0) }),
  z.object({ kind: z.literal('liveTension'), index: z.number().int().min(0) }),
]);

export const effectSchema = z.object({
  id: z.string().min(1),
  order: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  domain: z.enum(DOMAINS),
  text: z.string().min(1),
  derivedFrom: z.array(refSchema).min(1),
});

export const pageSchema = z.object({
  index: z.number().int().min(1),
  text: z.string().min(1),
  derivedFrom: z.string().min(1),
  shotType: z.enum(SHOT_TYPES),
  /**
   * Whether the main character is in this picture. When true, `hero.look` is
   * spliced into the image prompt so they are drawn the same way every time.
   * Absent on chapters stored before the story-first rework.
   */
  heroInScene: z.boolean().optional(),
  imagePrompt: z.string().min(1),
  entityRefs: z.array(z.string().min(1)),
  altText: z.string().min(1),
});

/**
 * Step 2 returns everything about a page except its text. The text is the
 * story pass's, merged in by the route, so a retry of step 2 can never touch
 * the prose.
 */
export const plateSpecSchema = pageSchema.omit({ text: true });

/** One movement of the chapter's arc, covering a contiguous run of pages. */
export const movementSchema = z.object({
  label: z.string().min(1),
  fromPage: z.number().int().min(1),
  toPage: z.number().int().min(1),
});

export const namedEntitySchema = z.object({
  name: z.string().min(1),
  /**
   * `person`: a recurring character other than the hero, drawn by costume like
   * the hero — and spliced in right after the hero, before the laws.
   */
  type: z.enum(['person', 'place', 'object', 'institution']),
  visualDescription: z.string().min(1),
});

export const worldCanonSchema = z.object({
  baseline: z.literal(BASELINE),
  activeRules: z.array(
    z.object({ rule: z.string().min(1), enteredChapter: z.number().int().min(1) }),
  ),
  physicsDeltas: z.array(z.string().min(1)),
  invariants: z.array(z.string().min(1)),
  namedEntities: z.array(namedEntitySchema),
  /**
   * What is always true on screen in this world, phrased positively and
   * visually. Spliced into every image prompt — this is the only channel through
   * which the rule reaches the illustrator at all.
   */
  visualLaws: z.array(z.string().min(1)),
  /**
   * Words naming things that do not exist in this world ("man", "men", "his"
   * for a world without men). Never sent to the illustrator — naming a thing
   * to forbid it only summons it. Used by the validator to keep these words
   * out of every image prompt. Defaults to empty for canon stored before it
   * existed.
   */
  neverDrawn: z.array(z.string().min(1)).default([]),
  liveTensions: z.array(z.string().min(1)),
  supersededRules: z.array(
    z.object({ rule: z.string().min(1), chapterReversed: z.number().int().min(1) }),
  ),
});

export const diagramHintsSchema = z.object({
  palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(3).max(5),
  motif: z.string().min(1),
});

/**
 * Retired with the story-first rework, kept so chapters stored before it still
 * type-check and export. Replaced by `hero`.
 */
export const throughLineSchema = z.object({
  role: z.string().min(1),
  headNoun: z.string().min(1),
  want: z.string().min(1),
});

/**
 * The person (or small group) the story follows. `role` is what the text calls
 * them — a name is allowed. `look` is what the illustrator is told every time
 * they are on a page: build, age, clothes, colours, something carried. Never a
 * face: twelve independent generations cannot hold one, but they can hold a
 * red coat and a coil of rope.
 */
export const heroSchema = z.object({
  role: z.string().min(1),
  look: z.string().min(1),
  want: z.string().min(1),
});

export const chapterResponseSchema = z.object({
  ruleType: z.enum(RULE_TYPES),
  transitionNote: z.string().optional(),
  worldTitle: z.string().optional(),
  styleBible: z.string().optional(),
  /** One sentence: what happened in this chapter. Carried forward as the digest. */
  summary: z.string().optional(),
  /** The story pass's private plan — trouble, want, turn, ending. Review only. */
  plan: z.string().optional(),
  diagramHints: diagramHintsSchema,
  hero: heroSchema,
  /** Legacy; see throughLineSchema. */
  throughLine: throughLineSchema.optional(),
  arc: z.array(movementSchema).min(1),
  chain: z.array(effectSchema).min(1),
  pages: z.array(pageSchema),
  worldCanon: worldCanonSchema,
});

/** What step 2 returns: the chapter minus everything the story pass owns. */
export const platesResponseSchema = z.object({
  ruleType: z.enum(RULE_TYPES),
  transitionNote: z.string().optional(),
  styleBible: z.string().optional(),
  worldCanon: worldCanonSchema,
  hero: heroSchema,
  chain: z.array(effectSchema).min(1),
  arc: z.array(movementSchema).min(1),
  pages: z.array(plateSpecSchema),
  diagramHints: diagramHintsSchema,
});

export const chapterDigestSchema = z.object({
  chapter: z.number().int().min(1),
  rule: z.string().min(1),
  ruleType: z.enum(RULE_TYPES),
  keyOutcome: z.string().min(1),
});

/**
 * `mode` separates the two things a person can type. A RULE is a statement about
 * how reality works, which the app derives consequences from. A STORY is a
 * fragment someone has already started, which wants continuing rather than
 * simulating. Forcing a story through "extract a rule, derive effects" produces
 * a report about a bicycle accident.
 */
export const PREFLIGHT_MODES = ['rule', 'story'] as const;

export const preflightSchema = z.object({
  verdict: z.enum(['valid', 'coercible', 'unusable']),
  mode: z.enum(PREFLIGHT_MODES),
  interpretedRule: z.string(),
  reason: z.string(),
});

export type Domain = (typeof DOMAINS)[number];
export type ShotType = (typeof SHOT_TYPES)[number];
export type RuleType = (typeof RULE_TYPES)[number];
/** What survives coercion: `ambiguous` resolves toward `contradictory`. */
export type CoercedRuleType = 'additive' | 'contradictory';

export type Ref = z.infer<typeof refSchema>;
export type Movement = z.infer<typeof movementSchema>;
export type PreflightMode = (typeof PREFLIGHT_MODES)[number];
/**
 * The same two values, named for where they are used after pre-flight: the mode
 * chosen there decides which chapter pipeline runs, and travels with the
 * chapter from the composer through the route to the validator and storage.
 */
export type ChapterMode = PreflightMode;
export type Effect = z.infer<typeof effectSchema>;
export type Page = z.infer<typeof pageSchema>;
export type NamedEntity = z.infer<typeof namedEntitySchema>;
export type WorldCanon = z.infer<typeof worldCanonSchema>;
export type DiagramHints = z.infer<typeof diagramHintsSchema>;
export type ThroughLine = z.infer<typeof throughLineSchema>;
export type Hero = z.infer<typeof heroSchema>;
export type PlateSpec = z.infer<typeof plateSpecSchema>;
export type PlatesResponse = z.infer<typeof platesResponseSchema>;
export type ChapterResponse = z.infer<typeof chapterResponseSchema>;
export type ChapterDigest = z.infer<typeof chapterDigestSchema>;
export type PreflightResult = z.infer<typeof preflightSchema>;

/**
 * Ambiguous resolves toward contradictory — better an explicit change than a
 * silent paper-over. Chapter 1 is always additive: there is nothing yet to
 * contradict.
 */
export function coerceRuleType(raw: RuleType, chapterNumber: number): CoercedRuleType {
  if (chapterNumber === 1) return 'additive';
  return raw === 'additive' ? 'additive' : 'contradictory';
}

// ── Storage ───────────────────────────────────────────────────────────────

export type ChapterStatus =
  | 'reasoning' | 'rendering' | 'complete'
  | 'halted_quota' | 'halted_error' | 'reasoning_failed';

/** `refused` is terminal: a placeholder page that is never retried. */
export type ImageStatus = 'pending' | 'generating' | 'ready' | 'failed' | 'refused';

export interface StoredWorld {
  id: string;
  createdAt: number;
  title: string;
  styleBible: string;
  /** Frozen with the styleBible in chapter 1; identifies the world at a glance. */
  palette: string[];
  worldCanon: WorldCanon;
  chapterDigests: ChapterDigest[];
}

export interface ChapterModels {
  story: string;
  plates: string;
}

export interface StoredChapter {
  id: string;
  worldId: string;
  number: number;
  rule: string;
  /**
   * Which pipeline wrote it. Absent on chapters stored before story mode
   * existed, which were all derived — read it as `rule` when missing.
   */
  mode?: ChapterMode;
  ruleType: CoercedRuleType;
  transitionNote?: string;
  diagramHints: DiagramHints;
  /** Legacy: chapters written before the story-first rework. */
  throughLine?: ThroughLine;
  /** Who the story follows. Absent on chapters stored before the rework. */
  hero?: Hero;
  /** One sentence of what happened. Absent before the rework. */
  summary?: string;
  /** The story pass's private plan. Absent before it was asked for. */
  plan?: string;
  /**
   * Which Gemini models wrote the story and planned the plates. A busy model
   * hands over to the next in GEMINI_FALLBACK_MODELS, so a weak chapter may have
   * been written by the last resort. Absent on chapters stored before fallback.
   */
  models?: ChapterModels;
  /** The pacing this chapter chose. Shown as the reader moves through the book. */
  arc: Movement[];
  chain: Effect[];
  pages: Page[];
  status: ChapterStatus;
  /** When a quota halt happened, so resume can tell whether the day has turned. */
  haltedAt?: number;
  haltMessage?: string;
  /**
   * The canon this chapter branched off, snapshotted at generation. The world's
   * canon is replaced each chapter, but the chain's invariant and liveTension
   * refs point into the canon that existed *then* — without this the reasoning
   * diagram becomes unreadable one chapter later. Provenance, not accumulation.
   */
  priorCanon?: WorldCanon;
}

export interface StoredImage {
  id: string;
  chapterId: string;
  pageIndex: number;
  blob: Blob | null;
  /**
   * Recorded for provenance only — Workers AI removed `seed` from the
   * flux-1-schnell input schema, so it is no longer transmitted and plates are
   * not reproducible from it. See lib/cloudflare.ts.
   */
  seed: number;
  promptUsed: string;
  status: ImageStatus;
  /** The measured `cf-ai-neurons` header for this plate, not a calculation. */
  neuronCost: number;
  /**
   * Why this plate failed, kept on the record so a cluster is diagnosable from
   * an export alone. Ten plates were once lost to a cause that took a live
   * replay to identify, because only the bare status was persisted.
   */
  failureCode?: number;
  failureMessage?: string;
}

export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

/** Sentences of a page's text, for the rhythm check. */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
