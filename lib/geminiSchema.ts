import { DOMAINS, PREFLIGHT_MODES, RULE_TYPES, SHOT_TYPES } from './types';

/**
 * Gemini's responseSchema is an OpenAPI subset, and it **rejects `minItems` and
 * `maxItems` outright** — a schema carrying them returns 400 INVALID_ARGUMENT
 * with no field detail. Every cap therefore lives in the prompt and in
 * lib/validate.ts, never here. Verified in Spike 0.
 *
 * `anyOf` does work, so the Ref union survives intact.
 *
 * **Every object carries `propertyOrdering`.** Without it the API writes
 * properties in alphabetical order, not the order they are declared — so the
 * old chapter schema had the model write `pages` before `styleBible`,
 * `throughLine` and `worldCanon`: every image prompt was written before the
 * visual laws it was meant to obey existed. Field order is the order the model
 * thinks in, so it is set deliberately, decisions before the things that
 * depend on them.
 */
const STRING = { type: 'STRING' } as const;
const INTEGER = { type: 'INTEGER' } as const;
const BOOLEAN = { type: 'BOOLEAN' } as const;

/** An OBJECT whose output order is its declaration order. All properties required. */
function object(properties: Record<string, unknown>, optional: string[] = []) {
  const keys = Object.keys(properties);
  return {
    type: 'OBJECT',
    properties,
    propertyOrdering: keys,
    required: keys.filter((key) => !optional.includes(key)),
  };
}

const refSchema = {
  anyOf: [
    object({ kind: { type: 'STRING', enum: ['rule'] } }),
    object({ kind: { type: 'STRING', enum: ['effect'] }, id: STRING }),
    object({ kind: { type: 'STRING', enum: ['invariant'] }, index: INTEGER }),
    object({ kind: { type: 'STRING', enum: ['liveTension'] }, index: INTEGER }),
  ],
};

const effectSchema = object({
  id: STRING,
  order: INTEGER,
  domain: { type: 'STRING', enum: [...DOMAINS] },
  text: STRING,
  derivedFrom: { type: 'ARRAY', items: refSchema },
});

/**
 * No `text`: the page text belongs to the story pass and is merged in by the
 * route. Within a page, the decisions (who is in it, which place) come before
 * the prompt that has to honour them.
 */
const plateSchema = object({
  index: INTEGER,
  derivedFrom: STRING,
  shotType: { type: 'STRING', enum: [...SHOT_TYPES] },
  heroInScene: BOOLEAN,
  entityRefs: { type: 'ARRAY', items: STRING },
  imagePrompt: STRING,
  altText: STRING,
});

/** Laws and the never-drawn list come before the entities, which must obey them. */
const worldCanonSchema = object({
  baseline: STRING,
  activeRules: { type: 'ARRAY', items: object({ rule: STRING, enteredChapter: INTEGER }) },
  visualLaws: { type: 'ARRAY', items: STRING },
  neverDrawn: { type: 'ARRAY', items: STRING },
  physicsDeltas: { type: 'ARRAY', items: STRING },
  invariants: { type: 'ARRAY', items: STRING },
  namedEntities: {
    type: 'ARRAY',
    items: object({
      name: STRING,
      type: { type: 'STRING', enum: ['person', 'place', 'object', 'institution'] },
      visualDescription: STRING,
    }),
  },
  liveTensions: { type: 'ARRAY', items: STRING },
  supersededRules: { type: 'ARRAY', items: object({ rule: STRING, chapterReversed: INTEGER }) },
});

/**
 * Step 2 of a chapter: the pictures and the world record, for a story that is
 * already written. Chapter 2+ gets no `styleBible` field at all, so
 * regenerating a frozen artifact is structurally impossible rather than merely
 * forbidden.
 *
 * Order: what kind of change this is → how pictures look → what is always on
 * screen → who the hero is → the reasoning → the shape → the plates.
 */
export function platesSchemaFor(chapterNumber: number) {
  const first = chapterNumber === 1;
  return object(
    {
      ruleType: { type: 'STRING', enum: [...RULE_TYPES] },
      transitionNote: STRING,
      ...(first ? { styleBible: STRING } : {}),
      worldCanon: worldCanonSchema,
      hero: object({ role: STRING, look: STRING, want: STRING }),
      chain: { type: 'ARRAY', items: effectSchema },
      arc: { type: 'ARRAY', items: object({ label: STRING, fromPage: INTEGER, toPage: INTEGER }) },
      pages: { type: 'ARRAY', items: plateSchema },
      diagramHints: object({ palette: { type: 'ARRAY', items: STRING }, motif: STRING }),
    },
    ['transitionNote'],
  );
}

/** Mode first: it is the decision everything else in the verdict depends on. */
export const preflightSchemaForGemini = object({
  mode: { type: 'STRING', enum: [...PREFLIGHT_MODES] },
  verdict: { type: 'STRING', enum: ['valid', 'coercible', 'unusable'] },
  interpretedRule: STRING,
  reason: STRING,
});
