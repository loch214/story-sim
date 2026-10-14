/**
 * Runs a captured chapter through the same contract the app does: parse,
 * normalise, every validation rule, prompt assembly.
 *
 *   npx tsx scripts/check-live.ts path/to/chapter.json [chapterNumber]
 *
 * The file is the merged chapter — the `chapter` field of a 200 from
 * /api/chapter, or one chapter of an export with `pages` carrying text.
 */
import { readFileSync } from 'node:fs';
import { normaliseChapter } from '../lib/normalise';
import { assembleImagePrompt } from '../lib/prompt';
import { chapterResponseSchema, PROMPT_LIMITS, wordCount } from '../lib/types';
import { validateChapter } from '../lib/validate';

const path = process.argv[2];
const chapterNumber = Number(process.argv[3] ?? 1);
if (!path) {
  console.error('usage: tsx scripts/check-live.ts <chapter.json> [chapterNumber]');
  process.exit(2);
}

const raw = JSON.parse(readFileSync(path, 'utf8'));
const parsed = chapterResponseSchema.safeParse(raw.chapter ?? raw);
if (!parsed.success) {
  console.error('✗ Schema parse failed:');
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}
console.log('✓ Parses against chapterResponseSchema');

const { chapter, report } = normaliseChapter(parsed.data, 'captured chapter');
if (report.strippedTokens.length > 0) {
  console.log(`  stripped style vocabulary from ${report.strippedTokens.length} page(s):`);
  for (const entry of report.strippedTokens) {
    console.log(`    page ${entry.pageIndex}: ${entry.tokens.join(', ')}`);
  }
}

const violations = validateChapter(chapter, { chapterNumber });
if (violations.length === 0) {
  console.log('✓ Passes all validation rules');
} else {
  console.log(`✗ ${violations.length} violation(s) — this is what the retry prompt would carry:`);
  for (const violation of violations) console.log(`   ${violation}`);
}

const styleBible = chapter.styleBible ?? '';
let longest = 0;
for (const page of chapter.pages) {
  const { prompt } = assembleImagePrompt(
    styleBible,
    page,
    chapter.worldCanon.namedEntities,
    chapter.worldCanon.visualLaws,
    chapter.hero,
  );
  longest = Math.max(longest, prompt.length);
}
const words = chapter.pages.map((p) => wordCount(p.text));
const heroPages = chapter.pages.filter((p) => p.heroInScene).length;
console.log(
  `  ${chapter.pages.length} pages · hero on ${heroPages} · styleBible ${styleBible.length}/${PROMPT_LIMITS.styleBible} · ` +
    `longest prompt ${longest}/${PROMPT_LIMITS.assembled} · page words ${Math.min(...words)}–${Math.max(...words)}`,
);
