import { normaliseChapter } from '@/lib/normalise';
import { persistNewWorld } from '@/lib/persist';
import { chapterResponseSchema } from '@/lib/types';
import { validateChapter } from '@/lib/validate';
import { FIXTURE_RULE, fixtureChapter } from './chapter-1';

/**
 * Puts the fixture through the same path a live chapter takes — parse,
 * normalise, validate, then the shared persistence helper — so the fixture
 * exercises the real contract rather than a convenient shortcut.
 */
export async function seedFixtureWorld(): Promise<string> {
  const parsed = chapterResponseSchema.parse(fixtureChapter);
  const { chapter } = normaliseChapter(parsed, FIXTURE_RULE);

  const violations = validateChapter(chapter, { chapterNumber: 1 });
  if (violations.length > 0) {
    throw new Error(`Fixture failed validation:\n${violations.join('\n')}`);
  }

  return persistNewWorld(chapter, FIXTURE_RULE);
}
