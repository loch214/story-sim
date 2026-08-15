import { IMAGE_STEPS, PROMPT_LIMITS, type NamedEntity, type Page } from './types';

export const COMPOSITION_CLAUSE =
  'composition: primary subject in upper two-thirds, lower third uncluttered';

const SEPARATOR = ' | ';

export interface AssembledPrompt {
  prompt: string;
  /** What the budget cost us, if anything. Worth logging when non-empty. */
  droppedEntities: string[];
  sceneTruncated: boolean;
}

/**
 * The styleBible is prepended to every image prompt; the entity descriptions are
 * spliced in by us, verbatim from canon, so chapter 3's tower is the same tower
 * as chapter 1's. The model never rewrites them.
 *
 * The composition clause exists because the text band sits over the lower
 * third — without it Flux centres the subject and the scrim covers the thing
 * worth seeing. See docs/SCHEMA.md § Image prompt assembly.
 */
export function assembleImagePrompt(
  styleBible: string,
  page: Page,
  canonEntities: NamedEntity[],
  visualLaws: string[] = [],
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

  // The laws appear twice, and deliberately. Attention thins out across a
  // 900-character prompt, so a cast rule stated once between the styleBible and
  // the scene gets diluted by everything after it — which is how a world without
  // men came back full of men. Once up front where the model is still weighting
  // heavily, once at the end next to the composition clause where the last word
  // lands. The repetition is cheap: two copies of 90 characters against a 2048
  // budget that currently peaks near 900.
  const build = () =>
    [
      styleBible,
      laws,
      kept.map((e) => e.visualDescription).join('; '),
      `${page.shotType} shot`,
      scene,
      COMPOSITION_CLAUSE,
      laws && `always true in this world: ${laws}`,
    ]
      .filter((part): part is string => Boolean(part) && part.length > 0)
      .join(SEPARATOR);

  // Truncation order is fixed so the same page always assembles the same way:
  // entity descriptions from the end backwards, then the scene at a word
  // boundary. The styleBible is never trimmed — a styleBible that varies
  // between pages defeats the mechanism it exists to serve. Neither are the
  // visual laws: they are the only thing carrying the rule into the image, so
  // dropping them to save characters would defeat the point of having them.
  while (build().length > PROMPT_LIMITS.total && kept.length > 0) {
    const dropped = kept[kept.length - 1];
    droppedEntities.push(dropped.name);
    kept = kept.slice(0, -1);
  }

  if (build().length > PROMPT_LIMITS.total) {
    const overflow = build().length - PROMPT_LIMITS.total;
    const words = scene.split(/\s+/);
    while (words.length > 1 && scene.length > overflow) {
      words.pop();
      scene = words.join(' ');
      sceneTruncated = true;
      if (build().length <= PROMPT_LIMITS.total) break;
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
