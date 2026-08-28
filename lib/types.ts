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

export const SHOT_TYPES = [
  'wide', 'detail', 'diagram', 'interior',
  'aerial', 'crowd', 'incidental-figures',
] as const;

export const RULE_TYPES = ['additive', 'contradictory', 'ambiguous'] as const;

// ── Limits ────────────────────────────────────────────────────────────────
// Flux Schnell caps the prompt at 2048 characters. Every part is budgeted so
// the worst case lands near 1782. See docs/SCHEMA.md § Character budget.

export const PROMPT_LIMITS = {
  total: 2048,
  /**
   * 320, not 600. The scene must dominate the prompt, not the style. At 600 the
   * shared prefix — styleBible plus laws plus entities — measured at 82% of the
   * average assembled prompt (check:fixture), so every plate looked alike
   * regardless of how varied the scenes were. Cut in favour of the scene.
   */
  styleBible: 320,
  entityDescription: 110,
  /**
   * Two, not three. Eleven of twelve pages once leaned on the same three
   * landmarks, which made the book feel like it was set in a single building.
   */
  entityRefsPerPage: 2,
  /**
   * The scene should dominate the prompt, not trail it. Budgeted against the
   * 2048 cap: 320 styleBible + 210 laws + 220 entities + 20 shot + 60
   * composition + separators leaves comfortable room for this to lead.
   */
  imagePrompt: 650,
  /**
   * 70, not 100. Shrunk alongside styleBible so the shared prefix stays a
   * minority of the prompt; three laws at 70 is 210, well under the scene.
   */
  visualLaw: 70,
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

export const PAGES_PER_CHAPTER = 12;
/**
 * How many movements a chapter's arc may have. The model picks the number and
 * the names to fit the premise — a rule that lasts a day wants a different shape
 * from one that plays out over generations. The validator enforces that the
 * movements tile the twelve pages; it says nothing about what they are called.
 * A fixed act structure would make every world the same shape.
 */
export const ARC_MOVEMENTS = { min: 2, max: 5 } as const;
export const MOVEMENT_LABEL_MAX_WORDS = 6;

/**
 * Pages are chosen from the chain, never a printout of it. Left unconstrained
 * the model writes one page per node in id order, and the book reads as twelve
 * disconnected facts. At least one effect must carry several pages so a moment
 * gets room; the cap stops the chapter collapsing onto a single idea.
 */
export const PAGES_FROM_ONE_EFFECT_MAX = 4;
/** How many of the twelve pages one named entity may appear on. */
export const ENTITY_PAGES_MAX = 5;
/** Pages that must go somewhere not already in namedEntities. */
export const PAGES_WITHOUT_ENTITIES_MIN = 3;

/**
 * Rhythm. Every sentence arriving at the same medium-long shape is most of why
 * the prose reads flat, and unlike vocabulary it is mechanically checkable: a
 * chapter has to land a short sentence somewhere. Not every page — an enforced
 * clipped closer on all twelve would be its own monotony.
 */
/**
 * Calibrated against live output, not guessed: at 7 words the rule fired on a
 * chapter whose prose was genuinely varied (lengths 6–18, mean 11), which would
 * have spent the chapter's single retry on a near-miss and left none for a real
 * structural fault. At 8 it separates actual monotony — everything landing at
 * 12–18 — from acceptable rhythm.
 */
export const SHORT_SENTENCE_WORDS = 8;
export const PAGES_WITH_SHORT_SENTENCE_MIN = 4;

/**
 * Register markers for PAGE TEXT ONLY. The chain is the reasoning layer and
 * stays precise; these are words that make a page read like a policy brief, a
 * lecture or a novel when there is an ordinary word for the same thing —
 * "underground trains", not "subterranean transit systems".
 *
 * Three families, because the pages went wrong in three directions: the
 * technical survey, the politics-and-economics briefing, and the literary
 * flourish. None of them is how a person tells someone what a place was like.
 *
 * Deliberately high-confidence rather than exhaustive. A blocklist cannot teach
 * voice, so this catches the repeat offenders and the prompt does the teaching.
 */
const STIFF_WORDS = [
  // survey / technical
  'subterranean', 'infrastructure', 'ecological', 'carrying capacity',
  'pioneer species', 'deluge', 'culvert', 'precipitation', 'vegetation',
  'apparatus', 'equilibrium', 'cessation', 'habitation', 'aforementioned',
  'thereby', 'subsequently', 'optimal', 'substantial', 'numerous',
  'individuals', 'personnel', 'vehicular', 'municipal', 'progressive',
  'structural',
  // politics / economics briefing
  'governance', 'regulatory', 'jurisdiction', 'socioeconomic', 'demographic',
  'populace', 'citizenry', 'stakeholders', 'sector', 'sectors', 'metrics',
  'protocols', 'discourse', 'paradigm', 'moreover', 'furthermore',
  'consequently', 'henceforth', 'whereby', 'wherein', 'thus', 'hence',
  'empirical', 'methodology', 'hypothesis',
  // literary flourish
  'whilst', 'amidst', 'amongst', 'thereafter', 'betwixt', 'myriad', 'plethora',
  'ineffable', 'liminal', 'ephemeral', 'gossamer', 'verdant', 'azure',
  'cerulean', 'resplendent', 'poignant', 'wistful', 'testament',
] as const;

/**
 * Stems, matched with any suffix. Written as a separate list because the old
 * single-alternation pattern wrapped every entry in `\b…\b`, which meant every
 * stem in it — `illuminat`, `utilis`, `colonis`, `facilitat` — could never match
 * the inflected word it was there to catch: `illuminate` has no word boundary
 * after `illuminat`. The list read as enforcement and enforced nothing.
 */
const STIFF_STEMS = [
  'transit system', 'residential structure', 'mechanism', 'illuminat', 'utilis',
  'utiliz', 'facilitat', 'commenc', 'colonis', 'coloniz', 'proliferat',
  'diminish', 'comprise', 'legislat', 'bureaucra', 'implementat', 'allocat',
  'prioritis', 'prioritiz', 'quantif', 'phenomen', 'inexorab', 'melanchol',
  'luminescen', 'susurr',
] as const;

export const STIFF_REGISTER_PATTERN = new RegExp(
  String.raw`\b(?:${STIFF_WORDS.join('|')}|(?:${STIFF_STEMS.join('|')})\w*)\b`,
  'i',
);

/**
 * The habitual register — "how things generally are" rather than "what
 * happened, once, to somebody" — is what makes a page read as an infographic
 * caption regardless of how plain its words are. Present tense stays allowed;
 * the enemy is frequency and generalisation, not tense. See rule 21.
 */
export const HABITUAL_PATTERN =
  /\b(?:increasingly|these days|nowadays|tends? to|usually|generally|typically|often|rarely|most people|many people|every (?:year|day|week)|each (?:year|day|week)|once a (?:day|week|month|year)|\d+ times a (?:day|week|month|year))\b/i;

/** How many of the twelve pages must carry the through-line's headNoun. See rule 20. */
export const THROUGH_LINE_PAGES_MIN = 7;

/**
 * At most this many pages may open on a definite-article proper noun or a bare
 * named-entity — "The Spindle rises…", "Halfweight Port launches…" — the
 * gazetteer rhythm that reads as an exhibit caption rather than a scene. See
 * rule 22.
 */
export const GAZETTEER_OPENING_MAX = 4;
export const GAZETTEER_OPENING_PATTERN = /^The [A-Z]/;

/**
 * A page sentence longer than this is where the prose stops sounding like
 * someone telling you what happened and starts sounding like a novel: clause
 * after clause, gathering detail no reader asked for. Calibrated against the
 * fixture, whose sentences ran to 29 words before this rule existed — the
 * rewrite that brought them under 22 lost nothing but the literary drag.
 *
 * Paired with SHORT_SENTENCE_WORDS: one caps the ceiling, the other forbids
 * every sentence landing at the same middling length.
 */
export const LONG_SENTENCE_WORDS = 22;

/**
 * Semicolons are the single clearest marker of a page written as literature
 * rather than as speech. Nobody says one out loud. Two short sentences always
 * do the same work and read faster.
 */
export const LITERARY_PUNCTUATION = /[;]/;

export const EFFECTS_PER_ORDER = 4;
export const MIN_DISTINCT_DOMAINS = 4;
/**
 * Story chapters follow one sequence of events through a few lives, so the
 * spread that keeps a *simulated* world from being a monoculture is exactly
 * wrong for them: forcing four domains is what turned "a boy fell off his
 * bicycle" into a chapter with a politics beat and an economics beat. Two keeps
 * the events from happening in a vacuum without conscripting a policy debate.
 */
export const MIN_DISTINCT_DOMAINS_STORY = 2;
export const MIN_DISTINCT_SHOT_TYPES = 4;
export const PAGE_WORDS = { min: 25, max: 45 } as const;
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
  imagePrompt: z.string().min(1),
  entityRefs: z.array(z.string().min(1)),
  altText: z.string().min(1),
});

/** One movement of the chapter's arc, covering a contiguous run of pages. */
export const movementSchema = z.object({
  label: z.string().min(1),
  fromPage: z.number().int().min(1),
  toPage: z.number().int().min(1),
});

export const namedEntitySchema = z.object({
  name: z.string().min(1),
  type: z.enum(['place', 'object', 'institution']),
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
 * The thread that carries a reader from page 1 to page 12. `role` is an
 * unnamed figure or group — never a name, never a face, same invariant as
 * `namedEntities` — and `headNoun` is one word from it so rule 20 can check
 * recurrence in page text without the model self-reporting where it appears.
 */
export const throughLineSchema = z.object({
  role: z.string().min(1),
  headNoun: z.string().min(1),
  want: z.string().min(1),
});

export const chapterResponseSchema = z.object({
  ruleType: z.enum(RULE_TYPES),
  transitionNote: z.string().optional(),
  worldTitle: z.string().optional(),
  styleBible: z.string().optional(),
  diagramHints: diagramHintsSchema,
  throughLine: throughLineSchema,
  arc: z.array(movementSchema).min(1),
  chain: z.array(effectSchema).min(1),
  pages: z.array(pageSchema),
  worldCanon: worldCanonSchema,
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
  /**
   * The thread carrying a reader from page 1 to page 12. Absent on chapters
   * stored before this field existed.
   */
  throughLine?: ThroughLine;
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
