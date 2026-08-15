import { WORLD_TITLE_MAX_WORDS, type ChapterResponse } from './types';

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

  const pages = chapter.pages.map((page) => {
    const { cleaned, tokens } = stripStyleVocabulary(page.imagePrompt);
    if (tokens.length > 0) strippedTokens.push({ pageIndex: page.index, tokens });
    return { ...page, imagePrompt: cleaned };
  });

  let worldTitle = chapter.worldTitle?.trim();
  let appliedTitleFallback = false;
  if (chapter.worldTitle !== undefined && !worldTitle) {
    worldTitle = truncateToWords(interpretedRule, WORLD_TITLE_MAX_WORDS);
    appliedTitleFallback = true;
  }

  return {
    chapter: { ...chapter, pages, ...(worldTitle ? { worldTitle } : {}) },
    report: { strippedTokens, appliedTitleFallback },
  };
}
