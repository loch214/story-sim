import { DOMAINS, PREFLIGHT_MODES, RULE_TYPES, SHOT_TYPES } from './types';

/**
 * Gemini's responseSchema is an OpenAPI subset, and it **rejects `minItems` and
 * `maxItems` outright** — a schema carrying them returns 400 INVALID_ARGUMENT
 * with no field detail. Every cap therefore lives in the prompt and in
 * lib/validate.ts, never here. Verified in Spike 0.
 *
 * `anyOf` does work, so the Ref union survives intact.
 */
const STRING = { type: 'STRING' } as const;
const INTEGER = { type: 'INTEGER' } as const;

const refSchema = {
  anyOf: [
    { type: 'OBJECT', properties: { kind: { type: 'STRING', enum: ['rule'] } }, required: ['kind'] },
    { type: 'OBJECT', properties: { kind: { type: 'STRING', enum: ['effect'] }, id: STRING }, required: ['kind', 'id'] },
    { type: 'OBJECT', properties: { kind: { type: 'STRING', enum: ['invariant'] }, index: INTEGER }, required: ['kind', 'index'] },
    { type: 'OBJECT', properties: { kind: { type: 'STRING', enum: ['liveTension'] }, index: INTEGER }, required: ['kind', 'index'] },
  ],
};

const effectSchema = {
  type: 'OBJECT',
  properties: {
    id: STRING,
    order: INTEGER,
    domain: { type: 'STRING', enum: [...DOMAINS] },
    text: STRING,
    derivedFrom: { type: 'ARRAY', items: refSchema },
  },
  required: ['id', 'order', 'domain', 'text', 'derivedFrom'],
};

const pageSchema = {
  type: 'OBJECT',
  properties: {
    index: INTEGER,
    text: STRING,
    derivedFrom: STRING,
    shotType: { type: 'STRING', enum: [...SHOT_TYPES] },
    imagePrompt: STRING,
    entityRefs: { type: 'ARRAY', items: STRING },
    altText: STRING,
  },
  required: ['index', 'text', 'derivedFrom', 'shotType', 'imagePrompt', 'entityRefs', 'altText'],
};

const worldCanonSchema = {
  type: 'OBJECT',
  properties: {
    baseline: STRING,
    activeRules: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { rule: STRING, enteredChapter: INTEGER }, required: ['rule', 'enteredChapter'] },
    },
    physicsDeltas: { type: 'ARRAY', items: STRING },
    invariants: { type: 'ARRAY', items: STRING },
    namedEntities: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { name: STRING, type: { type: 'STRING', enum: ['place', 'object', 'institution'] }, visualDescription: STRING },
        required: ['name', 'type', 'visualDescription'],
      },
    },
    visualLaws: { type: 'ARRAY', items: STRING },
    liveTensions: { type: 'ARRAY', items: STRING },
    supersededRules: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { rule: STRING, chapterReversed: INTEGER }, required: ['rule', 'chapterReversed'] },
    },
  },
  required: ['baseline', 'activeRules', 'physicsDeltas', 'invariants', 'namedEntities', 'visualLaws', 'liveTensions', 'supersededRules'],
};

/**
 * Chapter 2+ gets a variant with no `styleBible` and no `worldTitle` field at
 * all, so regenerating a frozen artifact is structurally impossible rather than
 * merely forbidden.
 */
export function chapterSchemaFor(chapterNumber: number) {
  const first = chapterNumber === 1;

  return {
    type: 'OBJECT',
    properties: {
      ruleType: { type: 'STRING', enum: [...RULE_TYPES] },
      transitionNote: STRING,
      ...(first ? { worldTitle: STRING, styleBible: STRING } : {}),
      diagramHints: {
        type: 'OBJECT',
        properties: { palette: { type: 'ARRAY', items: STRING }, motif: STRING },
        required: ['palette', 'motif'],
      },
      throughLine: {
        type: 'OBJECT',
        properties: { role: STRING, headNoun: STRING, want: STRING },
        required: ['role', 'headNoun', 'want'],
      },
      arc: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: { label: STRING, fromPage: INTEGER, toPage: INTEGER },
          required: ['label', 'fromPage', 'toPage'],
        },
      },
      chain: { type: 'ARRAY', items: effectSchema },
      pages: { type: 'ARRAY', items: pageSchema },
      worldCanon: worldCanonSchema,
    },
    required: [
      'ruleType',
      'diagramHints',
      'throughLine',
      'arc',
      'chain',
      'pages',
      'worldCanon',
      ...(first ? ['worldTitle', 'styleBible'] : []),
    ],
  };
}

export const preflightSchemaForGemini = {
  type: 'OBJECT',
  properties: {
    verdict: { type: 'STRING', enum: ['valid', 'coercible', 'unusable'] },
    mode: { type: 'STRING', enum: [...PREFLIGHT_MODES] },
    interpretedRule: STRING,
    reason: STRING,
  },
  required: ['verdict', 'mode', 'interpretedRule', 'reason'],
};
