import {
  EXPLICIT_PEOPLE_PATTERN,
  PROMPT_LIMITS,
  WORLD_TITLE_MAX_WORDS,
  type ChapterResponse,
  type NamedEntity,
} from './types';

/**
 * Style belongs to the styleBible, so a stray style token in an imagePrompt is
 * a token to remove — not 690 neurons to throw away. Normalisation never
 * rejects a chapter. See docs/SCHEMA.md § Normalisation.
 */
const BANNED_STYLE_PATTERNS: RegExp[] = [
  /\bphotorealistic\b/gi,
  /\bphotographs?\b/gi,
  /\bphotos?\b/gi,
  /\b3d\s+render(?:ing|ed)?\b/gi,
  /\boctane\b/gi,
  /\boil\s+painting\b/gi,
  /\banime\b/gi,
  /\bin\s+the\s+style\s+of\b/gi,
];

export interface NormaliseReport {
  /** Per page, the style tokens removed. A rising rate means the phase-1 prompt needs tightening. */
  strippedTokens: { pageIndex: number; tokens: string[] }[];
  appliedTitleFallback: boolean;
  /** Pages whose close-up of somebody was pulled back to a medium shot. */
  widenedShots: number[];
  /** Recurring people named in a page's text and attached to its picture. */
  attachedPeople: { pageIndex: number; name: string }[];
}

/**
 * Flux mangles hands, and a close-up of somebody doing something makes the
 * hands the picture: a letter pushed through a slot, a bicycle chain, a stamp
 * pressed down — the plates that came back tangled were close-ups of exactly
 * this, and the scene rarely says "hand" ("the girl reaches forward to push a
 * cream envelope into the slot"). The prompt forbids it and was ignored. So a
 * close-up or detail shot with anyone in it becomes a medium shot, where hands
 * are small and whole bodies carry the moment; tight shots stay for objects
 * alone. Faces lose nothing — they are never described.
 */
const HANDS_PATTERN = /\b(?:hands?|fingers?|fingertips?|fists?|palms?|knuckles?|thumbs?)\b/i;
const ANYONE_PATTERN =
  /\b(?:she|her|he|him|they|person|someone|somebody|child|children|kid|baby|toddler|girl|boy|woman|man|lady)\b/i;
const TIGHT_SHOTS = new Set(['close-up', 'detail']);

function hasSomebody(page: ChapterResponse['pages'][number], scene: string): boolean {
  return (
    page.heroInScene === true ||
    HANDS_PATTERN.test(scene) ||
    ANYONE_PATTERN.test(scene) ||
    EXPLICIT_PEOPLE_PATTERN.test(scene)
  );
}

export interface NormaliseResult {
  chapter: ChapterResponse;
  report: NormaliseReport;
}

function stripStyleVocabulary(prompt: string): { cleaned: string; tokens: string[] } {
  const tokens: string[] = [];
  let cleaned = prompt;

  for (const pattern of BANNED_STYLE_PATTERNS) {
    cleaned = cleaned.replace(pattern, (match) => {
      tokens.push(match);
      return '';
    });
  }

  // Removing a token mid-sentence leaves doubled spaces and orphaned commas.
  cleaned = cleaned
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;])/g, '$1')
    .replace(/([,;])\s*(?=[,.;])/g, '')
    .replace(/^[\s,;.]+|[\s,;]+$/g, '')
    .trim();

  return { cleaned, tokens };
}

function truncateToWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/);
  return words.length <= maxWords ? text.trim() : words.slice(0, maxWords).join(' ');
}

export function normaliseChapter(
  chapter: ChapterResponse,
  interpretedRule: string,
): NormaliseResult {
  const strippedTokens: NormaliseReport['strippedTokens'] = [];
  const widenedShots: number[] = [];

  const attachedPeople: NormaliseReport['attachedPeople'] = [];
  const people = chapter.worldCanon.namedEntities.filter(
    (e) => e.type === 'person' && e.name.trim().toLowerCase() !== chapter.hero.role.trim().toLowerCase(),
  );

  const pages = chapter.pages.map((page) => {
    const { cleaned, tokens } = stripStyleVocabulary(page.imagePrompt);
    if (tokens.length > 0) strippedTokens.push({ pageIndex: page.index, tokens });
    const handsUp = TIGHT_SHOTS.has(page.shotType) && hasSomebody(page, cleaned);
    if (handsUp) widenedShots.push(page.index);
    const entityRefs = hasSomebody(page, cleaned)
      ? attachNamedPeople(page, people, (name) => attachedPeople.push({ pageIndex: page.index, name }))
      : page.entityRefs;
    return { ...page, imagePrompt: cleaned, entityRefs, ...(handsUp ? { shotType: 'medium' as const } : {}) };
  });

  let worldTitle = chapter.worldTitle?.trim();
  let appliedTitleFallback = false;
  if (chapter.worldTitle !== undefined && !worldTitle) {
    worldTitle = truncateToWords(interpretedRule, WORLD_TITLE_MAX_WORDS);
    appliedTitleFallback = true;
  }

  return {
    chapter: { ...chapter, pages, ...(worldTitle ? { worldTitle } : {}) },
    report: { strippedTokens, appliedTitleFallback, widenedShots, attachedPeople },
  };
}

/**
 * A recurring person the page text names is in the picture, so their
 * description goes with it. Left to the model, "Are you Mara?" was drawn with
 * "a woman wearing a flour-dusted apron" and no reference — brown hair in a
 * bun on the page where she is introduced, red hair on every page after.
 * People come first in entityRefs; a place gives way to make room.
 */
function attachNamedPeople(
  page: ChapterResponse['pages'][number],
  people: NamedEntity[],
  onAttach: (name: string) => void,
): string[] {
  let refs = [...page.entityRefs];
  for (const person of people) {
    if (refs.includes(person.name)) continue;
    // Proper names only. A role is mentioned far more often than it is
    // present: "Beth had written her own mother's name" put the hero's mother
    // in a picture she was not in.
    const name = person.name.trim();
    if (!PROPER_NAME.test(name) || ROLE_WORDS.test(name)) continue;
    if (!new RegExp(`\\b${escapeRegExp(name)}\\b`).test(page.text)) continue;
    const isPerson = (name: string) => people.some((p) => p.name === name);
    const peopleRefs = refs.filter(isPerson);
    if (peopleRefs.length >= PROMPT_LIMITS.entityRefsPerPage) continue;
    refs = [...peopleRefs, person.name, ...refs.filter((name) => !isPerson(name))].slice(
      0,
      PROMPT_LIMITS.entityRefsPerPage,
    );
    onAttach(person.name);
  }
  return refs;
}

/** "Mara", "Old Tam" — capitalised, and not a "the …" role. */
const PROPER_NAME = /^(?!the\s)\p{Lu}[\p{L}'’-]*(?:\s\p{Lu}[\p{L}'’-]*)*$/u;
const ROLE_WORDS =
  /\b(?:mother|mum|mom|mama|father|dad|papa|grandmother|grandma|granny|nan|grandfather|grandpa|aunt|auntie|uncle|sister|brother|baby|teacher|doctor|nurse|baker|clerk|captain|mayor|queen|king)\b/i;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
