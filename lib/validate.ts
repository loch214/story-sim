import {
  ARC_MOVEMENTS,
  CANON_CAPS,
  EFFECTS_PER_ORDER,
  EFFECT_MAX_WORDS,
  MOVEMENT_LABEL_MAX_WORDS,
  MIN_DISTINCT_DOMAINS,
  MIN_DISTINCT_SHOT_TYPES,
  NEGATION_PATTERN,
  PAGES_PER_CHAPTER,
  PAGE_WORDS,
  PROMPT_LIMITS,
  TRANSITION_NOTE_MAX_WORDS,
  WORLD_TITLE_MAX_WORDS,
  coerceRuleType,
  wordCount,
  type ChapterResponse,
  type Effect,
  type WorldCanon,
} from './types';

export interface ValidateOptions {
  chapterNumber: number;
  /** The canon this chapter is superseding. Absent for chapter 1. */
  priorCanon?: WorldCanon;
}

/**
 * The fifteen rules of docs/SCHEMA.md § Validation, run to completion rather
 * than short-circuiting: the caller appends the whole list to the retry prompt,
 * so a partial list wastes the one retry we allow.
 */
export function validateChapter(
  chapter: ChapterResponse,
  { chapterNumber, priorCanon }: ValidateOptions,
): string[] {
  const v: string[] = [];
  const byId = new Map<string, Effect>(chapter.chain.map((e) => [e.id, e]));
  const isFirst = chapterNumber === 1;

  // 1. Twelve pages, indices 1–12 exactly once.
  if (chapter.pages.length !== PAGES_PER_CHAPTER) {
    v.push(`Rule 1: expected ${PAGES_PER_CHAPTER} pages, got ${chapter.pages.length}.`);
  }
  const indices = chapter.pages.map((p) => p.index).sort((a, b) => a - b);
  const expected = Array.from({ length: PAGES_PER_CHAPTER }, (_, i) => i + 1);
  if (indices.join(',') !== expected.join(',')) {
    v.push(`Rule 1: page indices must be 1–${PAGES_PER_CHAPTER} exactly once, got [${indices.join(', ')}].`);
  }

  // 2. Page text length.
  for (const page of chapter.pages) {
    const words = wordCount(page.text);
    if (words < PAGE_WORDS.min || words > PAGE_WORDS.max) {
      v.push(`Rule 2: page ${page.index} text is ${words} words, must be ${PAGE_WORDS.min}–${PAGE_WORDS.max}.`);
    }
  }

  // 3. Every page derives from a real effect.
  for (const page of chapter.pages) {
    if (!byId.has(page.derivedFrom)) {
      v.push(`Rule 3: page ${page.index} derivedFrom "${page.derivedFrom}" matches no effect id.`);
    }
  }

  // 4. All three orders present, at most four effects each.
  for (const order of [1, 2, 3] as const) {
    const count = chapter.chain.filter((e) => e.order === order).length;
    if (count === 0) v.push(`Rule 4: order ${order} has no effects; all three orders are required.`);
    if (count > EFFECTS_PER_ORDER) {
      v.push(`Rule 4: order ${order} has ${count} effects, cap is ${EFFECTS_PER_ORDER}. Drop the least important, do not grow the array.`);
    }
  }

  // 5. The chain actually chains.
  for (const effect of chapter.chain) {
    if (effect.order === 1) {
      if (!effect.derivedFrom.some((r) => r.kind === 'rule')) {
        v.push(`Rule 5: order-1 effect ${effect.id} must reference {kind:"rule"}.`);
      }
      continue;
    }
    const parentOrder = effect.order - 1;
    const chains = effect.derivedFrom.some(
      (r) => r.kind === 'effect' && byId.get(r.id)?.order === parentOrder,
    );
    if (!chains) {
      v.push(`Rule 5: order-${effect.order} effect ${effect.id} must reference at least one order-${parentOrder} effect.`);
    }
  }

  // 6. Chapter 2+ must touch the existing world.
  if (!isFirst) {
    const canonRefs = chapter.chain.flatMap((e) =>
      e.derivedFrom.filter((r) => r.kind === 'invariant' || r.kind === 'liveTension'),
    );
    if (canonRefs.length === 0) {
      v.push('Rule 6: the chain never references an invariant or liveTension. A new rule must interact with the existing world, not spawn unrelated consequences.');
    }
    for (const ref of canonRefs) {
      const pool = ref.kind === 'invariant' ? priorCanon?.invariants : priorCanon?.liveTensions;
      if (!pool || ref.index >= pool.length) {
        v.push(`Rule 6: ${ref.kind} index ${ref.index} is out of range of the prior canon.`);
      }
    }
  }

  // 7 & 8. Variety, so the atlas does not become a monoculture.
  const domains = new Set(chapter.chain.map((e) => e.domain));
  if (domains.size < MIN_DISTINCT_DOMAINS) {
    v.push(`Rule 7: chain spans ${domains.size} domains, need at least ${MIN_DISTINCT_DOMAINS}.`);
  }
  const shots = new Set(chapter.pages.map((p) => p.shotType));
  if (shots.size < MIN_DISTINCT_SHOT_TYPES) {
    v.push(`Rule 8: pages use ${shots.size} shot types, need at least ${MIN_DISTINCT_SHOT_TYPES}.`);
  }

  // 9. Entity references resolve, and stay within the prompt budget.
  const entityNames = new Set(chapter.worldCanon.namedEntities.map((e) => e.name));
  for (const page of chapter.pages) {
    if (page.entityRefs.length > PROMPT_LIMITS.entityRefsPerPage) {
      v.push(`Rule 9: page ${page.index} has ${page.entityRefs.length} entityRefs, cap is ${PROMPT_LIMITS.entityRefsPerPage}.`);
    }
    for (const name of page.entityRefs) {
      if (!entityNames.has(name)) {
        v.push(`Rule 9: page ${page.index} references entity "${name}", which is not in worldCanon.namedEntities.`);
      }
    }
  }

  // 10. Canon caps. Overflow is a schema violation, not a suggestion.
  for (const [field, cap] of Object.entries(CANON_CAPS) as [keyof typeof CANON_CAPS, number][]) {
    const length = chapter.worldCanon[field].length;
    if (length > cap) {
      v.push(`Rule 10: worldCanon.${field} has ${length} entries, cap is ${cap}. Drop the least important entry.`);
    }
  }

  // 11. Frozen artifacts belong to chapter 1 alone.
  if (isFirst) {
    if (!chapter.styleBible) {
      v.push('Rule 11: chapter 1 must return a styleBible.');
    } else if (chapter.styleBible.length > PROMPT_LIMITS.styleBible) {
      v.push(`Rule 11: styleBible is ${chapter.styleBible.length} characters, cap is ${PROMPT_LIMITS.styleBible}. It is prepended to every image prompt forever, so it must fit forever.`);
    }
    if (chapter.worldTitle && wordCount(chapter.worldTitle) > WORLD_TITLE_MAX_WORDS) {
      v.push(`Rule 11: worldTitle is ${wordCount(chapter.worldTitle)} words, cap is ${WORLD_TITLE_MAX_WORDS}.`);
    }
  } else {
    if (chapter.styleBible !== undefined) {
      v.push('Rule 11: chapter 2+ must not return a styleBible. It is frozen from chapter 1.');
    }
    if (chapter.worldTitle !== undefined) {
      v.push('Rule 11: chapter 2+ must not return a worldTitle. It is frozen from chapter 1.');
    }
  }

  // 12. A contradiction is an event, and leaves a trace.
  const coerced = coerceRuleType(chapter.ruleType, chapterNumber);
  const priorSuperseded = priorCanon?.supersededRules.length ?? 0;
  const nowSuperseded = chapter.worldCanon.supersededRules.length;
  if (coerced === 'contradictory') {
    if (nowSuperseded !== priorSuperseded + 1) {
      v.push(`Rule 12: a contradictory rule must move exactly one rule into supersededRules (expected ${priorSuperseded + 1}, got ${nowSuperseded}).`);
    }
    if (!chapter.transitionNote?.trim()) {
      v.push('Rule 12: a contradictory rule requires a transitionNote describing the changeover.');
    } else if (wordCount(chapter.transitionNote) > TRANSITION_NOTE_MAX_WORDS) {
      v.push(`Rule 12: transitionNote is ${wordCount(chapter.transitionNote)} words, cap is ${TRANSITION_NOTE_MAX_WORDS}.`);
    }
  } else if (nowSuperseded !== priorSuperseded) {
    v.push(`Rule 12: an additive rule must not change supersededRules (expected ${priorSuperseded}, got ${nowSuperseded}).`);
  }

  // 15. The arc must tile the twelve pages. This checks the SHAPE only — how
  // many movements there are and what they are called is the model's choice,
  // made to fit the premise. A fixed act structure would give every world in the
  // library the same rhythm, which is the opposite of the point.
  const arc = [...chapter.arc].sort((a, b) => a.fromPage - b.fromPage);
  if (arc.length < ARC_MOVEMENTS.min || arc.length > ARC_MOVEMENTS.max) {
    v.push(`Rule 15: arc has ${arc.length} movements, must be ${ARC_MOVEMENTS.min}–${ARC_MOVEMENTS.max}.`);
  }
  let cursor = 1;
  for (const movement of arc) {
    if (movement.fromPage !== cursor) {
      v.push(`Rule 15: movement "${movement.label}" starts at page ${movement.fromPage}, expected ${cursor}. Movements must be contiguous and cover pages 1–${PAGES_PER_CHAPTER} with no gaps or overlaps.`);
      break;
    }
    if (movement.toPage < movement.fromPage) {
      v.push(`Rule 15: movement "${movement.label}" ends at page ${movement.toPage} before it starts at ${movement.fromPage}.`);
      break;
    }
    if (wordCount(movement.label) > MOVEMENT_LABEL_MAX_WORDS) {
      v.push(`Rule 15: movement label "${movement.label}" is ${wordCount(movement.label)} words, cap is ${MOVEMENT_LABEL_MAX_WORDS}.`);
    }
    cursor = movement.toPage + 1;
  }
  if (arc.length > 0 && cursor !== PAGES_PER_CHAPTER + 1) {
    v.push(`Rule 15: the arc covers pages 1–${cursor - 1}, but there are ${PAGES_PER_CHAPTER} pages. Every page must belong to exactly one movement.`);
  }

  // 14. Visual laws are the only channel carrying the rule to the illustrator,
  // so they are checked harder than anything else in canon. A law phrased as an
  // absence is worse than no law at all: the image model cannot exclude, so
  // naming the forbidden thing is simply naming it. See NEGATION_PATTERN.
  for (const law of chapter.worldCanon.visualLaws) {
    if (law.length > PROMPT_LIMITS.visualLaw) {
      v.push(`Rule 14: visualLaw "${law.slice(0, 40)}…" is ${law.length} characters, cap is ${PROMPT_LIMITS.visualLaw}.`);
    }
    const negation = NEGATION_PATTERN.exec(law);
    if (negation) {
      v.push(
        `Rule 14: visualLaw "${law}" is phrased as an absence ("${negation[0]}"). ` +
          'The illustrator cannot exclude anything, so this makes the forbidden thing MORE likely to appear. ' +
          'Rewrite it to state what IS on screen instead.',
      );
    }
  }

  // 13. Length caps that keep assembly inside the 2048-character endpoint limit.
  for (const page of chapter.pages) {
    if (page.imagePrompt.length > PROMPT_LIMITS.imagePrompt) {
      v.push(`Rule 13: page ${page.index} imagePrompt is ${page.imagePrompt.length} characters, cap is ${PROMPT_LIMITS.imagePrompt}.`);
    }
  }
  for (const entity of chapter.worldCanon.namedEntities) {
    if (entity.visualDescription.length > PROMPT_LIMITS.entityDescription) {
      v.push(`Rule 13: visualDescription for "${entity.name}" is ${entity.visualDescription.length} characters, cap is ${PROMPT_LIMITS.entityDescription}.`);
    }
  }
  for (const effect of chapter.chain) {
    if (wordCount(effect.text) > EFFECT_MAX_WORDS) {
      v.push(`Rule 13: effect ${effect.id} is ${wordCount(effect.text)} words, cap is ${EFFECT_MAX_WORDS}.`);
    }
  }

  return v;
}
