import { IMAGE_STEPS, PROMPT_LIMITS, type Hero, type NamedEntity, type Page } from './types';

/**
 * The text band sits over the lower third — without this Flux centres the
 * subject and the scrim covers the thing worth seeing. Shortened with the
 * rework: every character here is one the encoder might not reach.
 */
export const COMPOSITION_CLAUSE = 'main subject in the upper two-thirds, quiet lower third';

const SEPARATOR = ' | ';

export interface AssembledPrompt {
  prompt: string;
  /** What the budget cost us, if anything. Worth logging when non-empty. */
  droppedEntities: string[];
  sceneTruncated: boolean;
}

/**
 * Order is priority, because Flux reads only the first ~256 tokens and weights
 * the earliest heaviest:
 *
 *   1. the scene — the only thing that differs between plates, and the part
 *      that says what is happening on this page
 *   2. the hero's look, when they are on the page — right after the scene that
 *      mentions them, so the description binds to them
 *   3. any recurring person on the page (the little sister), verbatim from
 *      canon — a person, like the hero, is held by costume
 *   4. the visual laws — what is always true on screen; early enough that
 *      nothing can clip them (they used to sit ~1,300 characters in)
 *   5. the named place or object, verbatim from canon
 *   6. shot, styleBible, composition — the parts that can lose a few words at
 *      the tail without the picture contradicting the story
 *
 * The entity descriptions and the hero's look are spliced in by us, verbatim,
 * so chapter 3's tower is chapter 1's tower and page 9's girl wears page 2's
 * coat. The model never rewrites them. See docs/SCHEMA.md § Image prompt assembly.
 */
export function assembleImagePrompt(
  styleBible: string,
  page: Page,
  canonEntities: NamedEntity[],
  visualLaws: string[] = [],
  hero?: Hero,
): AssembledPrompt {
  const byName = new Map(canonEntities.map((e) => [e.name, e]));
  const entities = page.entityRefs
    .slice(0, PROMPT_LIMITS.entityRefsPerPage)
    .map((name) => byName.get(name))
    .filter((e): e is NamedEntity => e !== undefined);

  const droppedEntities: string[] = [];
  let sceneTruncated = false;
  let scene = page.imagePrompt;
  let kept = [...entities];

  const laws = visualLaws.slice(0, PROMPT_LIMITS.visualLawsPerPrompt).join('; ');
  const heroLook = page.heroInScene && hero ? hero.look : '';

  const describe = (people: boolean) =>
    kept
      .filter((e) => (e.type === 'person') === people)
      .map((e) => e.visualDescription)
      .join('; ');

  const build = () =>
    [
      scene,
      heroLook,
      describe(true),
      laws,
      describe(false),
      `${page.shotType} shot`,
      styleBible,
      COMPOSITION_CLAUSE,
    ]
      .filter((part): part is string => Boolean(part) && part.length > 0)
      .join(SEPARATOR);

  // Truncation order is fixed so the same page always assembles the same way:
  // places and objects first, then people, then the scene at a word boundary.
  // The caps are set so none of it normally happens. The styleBible, laws and
  // hero look are never trimmed — each exists to be identical on every plate.
  while (build().length > PROMPT_LIMITS.assembled && kept.length > 0) {
    const thing = kept.findLast((e) => e.type !== 'person');
    const dropped = thing ?? kept[kept.length - 1];
    droppedEntities.push(dropped.name);
    kept = kept.filter((e) => e !== dropped);
  }

  if (build().length > PROMPT_LIMITS.assembled) {
    const words = scene.split(/\s+/);
    while (words.length > 1 && build().length > PROMPT_LIMITS.assembled) {
      words.pop();
      scene = words.join(' ');
      sceneTruncated = true;
    }
  }

  return { prompt: build(), droppedEntities, sceneTruncated };
}

/**
 * Prefer the `cf-ai-neurons` response header — Cloudflare reports the real cost
 * of every call. This is the fallback for when the header is absent.
 *
 * Steps are billed *per tile*, which is what makes a 1024×1024 plate at 4 steps
 * cost 172.80 rather than the 57.60 a per-image reading of the rate card
 * suggests. Verified against the header in Spike 0. See PLAN.md § Budget.
 */
export function neuronCost(width: number, height: number, steps = IMAGE_STEPS): number {
  const tiles = Math.ceil(width / 512) * Math.ceil(height / 512);
  return tiles * 4.8 + tiles * steps * 9.6;
}
