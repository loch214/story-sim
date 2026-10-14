import {
  ARC_MOVEMENTS,
  CANON_CAPS,
  EFFECT_MAX_WORDS,
  MOVEMENT_LABEL_MAX_WORDS,
  PROMPT_LIMITS,
  WORLD_TITLE_MAX_WORDS,
  type ChapterResponse,
  type Effect,
  type Movement,
  type Ref,
  type WorldCanon,
} from './types';

/**
 * Bookkeeping the model gets wrong and the app can put right without asking.
 *
 * A finished book was thrown away — twice, after its one retry — because
 * chain entry e9 cited an order-1 entry instead of an order-2 one: a wrong
 * arrow in the "how this world works" diagram, which the reader never sees
 * unless they open it. Faults like that are mechanical, the fix is
 * unambiguous, and sending them back to the model spent requests and failed
 * anyway. They are repaired here, before validation, and recorded.
 *
 * What is NOT repaired is anything that changes what the reader reads or sees:
 * a neverDrawn word in a scene, a law phrased as an absence, a missing age, the
 * hero absent from the pictures, a thin scene. Those still go back to the
 * model. The validator keeps every rule as a backstop.
 */
export interface RepairContext {
  chapterNumber?: number;
  priorCanon?: WorldCanon;
}

export function repairBookkeeping(
  chapter: ChapterResponse,
  { chapterNumber = 1, priorCanon }: RepairContext = {},
): { chapter: ChapterResponse; repairs: string[] } {
  const repairs: string[] = [];
  const note = (what: string) => repairs.push(what);
  const first = chapterNumber === 1;

  const chain = repairChain(chapter.chain, note, first ? undefined : priorCanon);
  const ids = chain.map((e) => e.id);
  const n = chapter.pages.length;

  // Rule 9: references resolve and fit the budget, people first.
  const entityNames = new Set(chapter.worldCanon.namedEntities.map((e) => e.name));
  const isPerson = (name: string) =>
    chapter.worldCanon.namedEntities.some((e) => e.name === name && e.type === 'person');

  const pages = chapter.pages.map((page, i) => {
    let next = page;
    // Rule 3: every page cites a real chain entry. Spread evenly if not.
    if (ids.length > 0 && !ids.includes(page.derivedFrom)) {
      next = { ...next, derivedFrom: ids[Math.min(ids.length - 1, Math.floor((i * ids.length) / n))] };
      note(`page ${page.index}: derivedFrom "${page.derivedFrom}" → ${next.derivedFrom}`);
    }
    const known = next.entityRefs.filter((name) => entityNames.has(name));
    const ordered = [...known.filter(isPerson), ...known.filter((name) => !isPerson(name))];
    const refs = [...new Set(ordered)].slice(0, PROMPT_LIMITS.entityRefsPerPage);
    if (refs.join('\u0000') !== next.entityRefs.join('\u0000')) {
      note(`page ${page.index}: entityRefs [${next.entityRefs.join(', ')}] → [${refs.join(', ')}]`);
      next = { ...next, entityRefs: refs };
    }
    // Rule 13: the assembler would cut an overlong scene anyway; cut it here,
    // at a word boundary, so the stored scene is the one drawn.
    if (next.imagePrompt.length > PROMPT_LIMITS.imagePrompt) {
      next = { ...next, imagePrompt: clipChars(next.imagePrompt, PROMPT_LIMITS.imagePrompt) };
      note(`page ${page.index}: imagePrompt trimmed to ${next.imagePrompt.length} characters`);
    }
    return next;
  });

  // Rule 10: canon caps. Keep the first entries — the model lists what matters first.
  let worldCanon = chapter.worldCanon;
  for (const [field, cap] of Object.entries(CANON_CAPS) as [keyof typeof CANON_CAPS, number][]) {
    const list = worldCanon[field] as unknown[];
    if (list.length > cap) {
      worldCanon = { ...worldCanon, [field]: list.slice(0, cap) };
      note(`worldCanon.${field}: ${list.length} entries → ${cap}`);
    }
  }
  // Rule 13: descriptions that run past the hard cap lose their tail.
  worldCanon = {
    ...worldCanon,
    namedEntities: worldCanon.namedEntities.map((e) => {
      if (e.visualDescription.length <= PROMPT_LIMITS.entityDescriptionMax) return e;
      note(`entity "${e.name}": description trimmed`);
      return { ...e, visualDescription: clipChars(e.visualDescription, PROMPT_LIMITS.entityDescriptionMax) };
    }),
  };

  let hero = chapter.hero;
  if (hero.look.length > PROMPT_LIMITS.heroLook) {
    hero = { ...hero, look: clipChars(hero.look, PROMPT_LIMITS.heroLook) };
    note('hero.look trimmed');
  }

  // Rule 11: frozen artefacts. A later chapter's own styleBible is dropped,
  // never used; chapter 1's is trimmed at a sentence where it can be.
  let styleBible = chapter.styleBible;
  let worldTitle = chapter.worldTitle;
  if (!first) {
    if (styleBible !== undefined) note('styleBible dropped: frozen from chapter 1');
    if (worldTitle !== undefined) note('worldTitle dropped: frozen from chapter 1');
    styleBible = undefined;
    worldTitle = undefined;
  } else {
    if (styleBible && styleBible.length > PROMPT_LIMITS.styleBible) {
      styleBible = clipSentences(styleBible, PROMPT_LIMITS.styleBible);
      note(`styleBible trimmed to ${styleBible.length} characters`);
    }
    if (worldTitle && worldTitle.trim().split(/\s+/).length > WORLD_TITLE_MAX_WORDS) {
      worldTitle = clipWords(worldTitle, WORLD_TITLE_MAX_WORDS);
      note('worldTitle shortened');
    }
  }

  const arc = repairArc(chapter.arc, n, note);

  return {
    chapter: {
      ...chapter,
      ...(styleBible === undefined ? { styleBible: undefined } : { styleBible }),
      ...(worldTitle === undefined ? { worldTitle: undefined } : { worldTitle }),
      hero,
      worldCanon,
      chain,
      arc,
      pages,
    },
    repairs,
  };
}

/**
 * Rule 5 (and 6, 13 for chain text). Every order-1 entry cites the rule; every
 * order-2 and order-3 entry cites an entry one order below — preferably one
 * that descends from something it already cites, so the arrow it gains is the
 * one the model most likely meant. Arrows that point sideways or upward, or at
 * ids that do not exist, are dropped; the diagram cannot draw them.
 */
function repairChain(chain: Effect[], note: (what: string) => void, priorCanon?: WorldCanon): Effect[] {
  const byId = new Map(chain.map((e) => [e.id, e]));
  const repaired = chain.map((effect) => {
    let refs: Ref[] = effect.derivedFrom.filter((r) => {
      if (r.kind !== 'effect') return true;
      const target = byId.get(r.id);
      return target !== undefined && target.order < effect.order;
    });
    if (refs.length !== effect.derivedFrom.length) note(`${effect.id}: dropped references it cannot derive from`);

    if (effect.order === 1) {
      if (!refs.some((r) => r.kind === 'rule')) {
        refs = [{ kind: 'rule' }, ...refs];
        note(`${effect.id}: now derives from the rule`);
      }
    } else {
      const parentOrder = effect.order - 1;
      const hasParent = refs.some((r) => r.kind === 'effect' && byId.get(r.id)?.order === parentOrder);
      if (!hasParent) {
        const candidates = chain.filter((e) => e.order === parentOrder);
        const cited = new Set(refs.flatMap((r) => (r.kind === 'effect' ? [r.id] : [])));
        const parent =
          candidates.find((c) => c.derivedFrom.some((r) => r.kind === 'effect' && cited.has(r.id))) ??
          candidates[Math.min(candidates.length - 1, chain.filter((e) => e.order === effect.order).indexOf(effect))];
        if (parent) {
          refs = [...refs, { kind: 'effect', id: parent.id }];
          note(`${effect.id}: now derives from ${parent.id}`);
        }
      }
    }
    if (refs.length === 0) refs = [{ kind: 'rule' }];

    // Canon references must point at something that exists.
    refs = refs.filter((r) => {
      if (r.kind === 'invariant') return r.index < (priorCanon?.invariants.length ?? 0);
      if (r.kind === 'liveTension') return r.index < (priorCanon?.liveTensions.length ?? 0);
      return true;
    });

    const words = effect.text.trim().split(/\s+/);
    const text = words.length > EFFECT_MAX_WORDS ? words.slice(0, EFFECT_MAX_WORDS).join(' ') : effect.text;
    if (text !== effect.text) note(`${effect.id}: text shortened to ${EFFECT_MAX_WORDS} words`);
    return { ...effect, derivedFrom: refs, text };
  });

  // Rule 6: a later chapter's chain touches the existing world. If the model
  // forgot, the first entry is tied to the first thing the world already had.
  if (priorCanon) {
    const touches = repaired.some((e) => e.derivedFrom.some((r) => r.kind === 'invariant' || r.kind === 'liveTension'));
    const anchor: Ref | undefined =
      priorCanon.liveTensions.length > 0
        ? { kind: 'liveTension', index: 0 }
        : priorCanon.invariants.length > 0
          ? { kind: 'invariant', index: 0 }
          : undefined;
    if (!touches && anchor && repaired.length > 0) {
      repaired[0] = { ...repaired[0], derivedFrom: [...repaired[0].derivedFrom, anchor] };
      note(`${repaired[0].id}: tied to the existing world (${anchor.kind} 0)`);
    }
  }
  return repaired;
}

/** Rule 15: movements tile pages 1–n, in order, 2–5 of them, short labels. */
function repairArc(arc: Movement[], n: number, note: (what: string) => void): Movement[] {
  if (arc.length === 0) return arc;
  let movements = [...arc]
    .filter((m) => m.label.trim().length > 0)
    .sort((a, b) => a.fromPage - b.fromPage);

  if (movements.length > ARC_MOVEMENTS.max) {
    const tail = movements.slice(ARC_MOVEMENTS.max - 1);
    movements = [...movements.slice(0, ARC_MOVEMENTS.max - 1), { ...tail[0], toPage: Math.max(...tail.map((m) => m.toPage)) }];
    note(`arc: ${arc.length} movements merged to ${ARC_MOVEMENTS.max}`);
  }

  const before = JSON.stringify(movements);
  let cursor = 1;
  movements = movements.map((m, i) => {
    const last = i === movements.length - 1;
    const remaining = movements.length - 1 - i;
    const from = cursor;
    // Leave at least one page for each movement still to come.
    const to = last ? n : Math.min(Math.max(m.toPage, from), n - remaining);
    cursor = to + 1;
    const label = clipWords(m.label, MOVEMENT_LABEL_MAX_WORDS);
    return { ...m, fromPage: from, toPage: to, label };
  });
  if (JSON.stringify(movements) !== before) note('arc: movements re-tiled to cover every page');
  return movements;
}

function clipWords(text: string, max: number): string {
  const words = text.trim().split(/\s+/);
  return words.length <= max ? text.trim() : words.slice(0, max).join(' ');
}

function clipChars(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max + 1);
  const space = cut.lastIndexOf(' ');
  return (space > max * 0.6 ? cut.slice(0, space) : text.slice(0, max)).replace(/[\s,;:–—-]+$/, '');
}

function clipSentences(text: string, max: number): string {
  if (text.length <= max) return text;
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [];
  let kept = '';
  for (const sentence of sentences) {
    if ((kept + sentence).trim().length > max) break;
    kept += sentence;
  }
  return kept.trim().length > max * 0.6 ? kept.trim() : clipChars(text, max);
}
