import { imageId } from '@/lib/db';
import type { Effect, Page, StoredChapter, StoredImage } from '@/lib/types';

/**
 * The book's reading order: plates, in order, across every chapter. Arrow keys
 * move through the whole volume, chapter boundaries included.
 *
 * The reasoning diagram is deliberately *not* in here. It used to open every
 * chapter, which meant a reader landed on the machinery before seeing a single
 * picture, and passed back through it between chapters. It is now a view of its
 * own, reached by an explicit control. The picture book is the product; the
 * diagram is for people who want to dig.
 */
export type Spread = {
  kind: 'page';
  key: string;
  chapter: StoredChapter;
  page: Page;
  effect?: Effect;
  image?: StoredImage;
};

export function buildSpreads(
  chapters: StoredChapter[],
  images: Map<string, StoredImage>,
): Spread[] {
  const spreads: Spread[] = [];

  for (const chapter of chapters) {
    const effects = new Map(chapter.chain.map((effect) => [effect.id, effect]));
    for (const page of [...chapter.pages].sort((a, b) => a.index - b.index)) {
      spreads.push({
        kind: 'page',
        key: `${chapter.id}:${page.index}`,
        chapter,
        page,
        effect: effects.get(page.derivedFrom),
        image: images.get(imageId(chapter.id, page.index)),
      });
    }
  }

  return spreads;
}
