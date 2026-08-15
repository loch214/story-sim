import { imageId, putChapter, putImage, putWorld, requestPersistence } from './db';
import { assembleImagePrompt } from './prompt';
import { pageSeed } from './seed';
import {
  CHAPTER_DIGEST_CAP,
  coerceRuleType,
  wordCount,
  type ChapterResponse,
  type NamedEntity,
  type Page,
  type StoredChapter,
  type StoredImage,
  type StoredWorld,
} from './types';

/**
 * A chapter's one-line digest, derived rather than generated: the last
 * third-order effect is the furthest the reasoning travelled, which is the most
 * useful thing to carry into the next chapter's bounded context.
 */
function keyOutcome(chapter: ChapterResponse): string {
  const deepest = [...chapter.chain].reverse().find((effect) => effect.order === 3) ?? chapter.chain.at(-1);
  const text = deepest?.text ?? '';
  const words = text.split(/\s+/);
  return words.length <= 30 ? text : `${words.slice(0, 30).join(' ')}…`;
}

/**
 * Queues a chapter's twelve plates as pending. Prompts are assembled and seeds
 * derived here so the render pool has nothing left to decide — and the
 * styleBible passed in is always the world's frozen one, never a chapter's.
 */
async function queuePlates(
  worldId: string,
  chapterId: string,
  chapterNumber: number,
  pages: Page[],
  styleBible: string,
  entities: NamedEntity[],
  visualLaws: string[],
): Promise<void> {
  for (const page of pages) {
    const { prompt } = assembleImagePrompt(styleBible, page, entities, visualLaws);
    const image: StoredImage = {
      id: imageId(chapterId, page.index),
      chapterId,
      pageIndex: page.index,
      blob: null,
      seed: pageSeed(worldId, chapterNumber, page.index),
      promptUsed: prompt,
      status: 'pending',
      neuronCost: 0,
    };
    await putImage(image);
  }
}

export async function persistNewWorld(chapter: ChapterResponse, rule: string): Promise<string> {
  const worldId = crypto.randomUUID();
  const chapterId = `${worldId}:1`;
  const styleBible = chapter.styleBible ?? '';

  const world: StoredWorld = {
    id: worldId,
    createdAt: Date.now(),
    title: chapter.worldTitle?.trim() || truncateWords(rule, 6),
    styleBible,
    palette: chapter.diagramHints.palette,
    worldCanon: chapter.worldCanon,
    chapterDigests: [
      { chapter: 1, rule, ruleType: chapter.ruleType, keyOutcome: keyOutcome(chapter) },
    ],
  };

  const storedChapter: StoredChapter = {
    id: chapterId,
    worldId,
    number: 1,
    rule,
    ruleType: coerceRuleType(chapter.ruleType, 1),
    transitionNote: chapter.transitionNote,
    diagramHints: chapter.diagramHints,
    arc: chapter.arc,
    chain: chapter.chain,
    pages: chapter.pages,
    status: 'rendering',
  };

  await requestPersistence();
  await putWorld(world);
  await putChapter(storedChapter);
  await queuePlates(
    worldId,
    chapterId,
    1,
    chapter.pages,
    styleBible,
    chapter.worldCanon.namedEntities,
    chapter.worldCanon.visualLaws,
  );

  return worldId;
}

/**
 * Appends a chapter. The world's canon is **replaced** entirely by the new one —
 * the old is discarded, never merged — while the chapter keeps a snapshot of
 * what it branched off so its reasoning diagram stays readable.
 *
 * The styleBible and palette are never touched. They were frozen in chapter 1.
 */
export async function persistNextChapter(
  world: StoredWorld,
  chapter: ChapterResponse,
  rule: string,
  chapterNumber: number,
): Promise<string> {
  const chapterId = `${world.id}:${chapterNumber}`;

  const digests = [
    ...world.chapterDigests,
    { chapter: chapterNumber, rule, ruleType: chapter.ruleType, keyOutcome: keyOutcome(chapter) },
  ].slice(-CHAPTER_DIGEST_CAP);

  await putWorld({
    ...world,
    worldCanon: chapter.worldCanon,
    chapterDigests: digests,
  });

  const storedChapter: StoredChapter = {
    id: chapterId,
    worldId: world.id,
    number: chapterNumber,
    rule,
    ruleType: coerceRuleType(chapter.ruleType, chapterNumber),
    transitionNote: chapter.transitionNote,
    diagramHints: chapter.diagramHints,
    arc: chapter.arc,
    chain: chapter.chain,
    pages: chapter.pages,
    status: 'rendering',
    priorCanon: world.worldCanon,
  };

  await putChapter(storedChapter);
  await queuePlates(
    world.id,
    chapterId,
    chapterNumber,
    chapter.pages,
    world.styleBible,
    chapter.worldCanon.namedEntities,
    // From the NEW canon, not the old. The styleBible is frozen, but the visual
    // laws are not: a rule that reverses an earlier one has to be able to put
    // back what that rule took off the page.
    chapter.worldCanon.visualLaws,
  );

  return chapterId;
}

function truncateWords(text: string, max: number): string {
  const words = text.trim().split(/\s+/);
  return wordCount(text) <= max ? text.trim() : words.slice(0, max).join(' ');
}
