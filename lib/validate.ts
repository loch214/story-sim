import {
  AGE_PATTERN,
  ARC_MOVEMENTS,
  CANON_CAPS,
  EFFECTS_PER_ORDER,
  EFFECT_MAX_WORDS,
  EXPLICIT_PEOPLE_PATTERN,
  HERO_PAGES_MIN_SHARE,
  MIN_DISTINCT_SHOT_TYPES,
  MOVEMENT_LABEL_MAX_WORDS,
  NEGATION_PATTERN,
  PAGES,
  PAGE_WORDS,
  PERSON_WORD_PATTERN,
  PROMPT_LIMITS,
  SCENE_CHARS_MIN,
  TRANSITION_NOTE_MAX_WORDS,
  VAGUE_PEOPLE_PATTERN,
  WORLD_TITLE_MAX_WORDS,
  coerceRuleType,
  wordCount,
  type ChapterMode,
  type ChapterResponse,
  type Effect,
  type WorldCanon,
} from './types';

/** Model-authored words are spliced into a RegExp; escape them first. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface ValidateOptions {
  chapterNumber: number;
  /** The canon this chapter is superseding. Absent for chapter 1. */
  priorCanon?: WorldCanon;
  /** Which pipeline wrote this chapter. No rule currently differs by mode. */
  mode?: ChapterMode;
  /**
   * The world's frozen styleBible — `chapter.styleBible` for chapter 1, the
   * stored world's for chapter 2+. Checked against `neverDrawn` (rule 23).
   */
  worldStyleBible?: string;
}

/**
 * The rules of docs/SCHEMA.md § Validation, run to completion rather than
 * short-circuiting: the caller appends the whole list to the retry prompt, so
 * a partial list wastes the one retry we allow.
 *
 * Every rule here checks STRUCTURE or what reaches the illustrator. None polices
 * the page text's style. Rules 16–22 did, and they are retired: each was added
 * to fix one symptom of the book reading like slides, together they made the
 * model write to a checklist, and none of them could create a plot. The prose
 * now comes from a separate story pass whose only checks are page count and
 * page length. Retired numbers are not reused, so old exports still read.
 */
export function validateChapter(
  chapter: ChapterResponse,
  { chapterNumber, priorCanon, worldStyleBible }: ValidateOptions,
): string[] {
  const v: string[] = [];
  const byId = new Map<string, Effect>(chapter.chain.map((e) => [e.id, e]));
  const isFirst = chapterNumber === 1;
  const n = chapter.pages.length;

  // 1. Twelve to fifteen pages, indices 1–N exactly once.
  if (n < PAGES.min || n > PAGES.max) {
    v.push(`Rule 1: expected ${PAGES.min}–${PAGES.max} pages, got ${n}.`);
  }
  const indices = chapter.pages.map((p) => p.index).sort((a, b) => a - b);
  const expected = Array.from({ length: n }, (_, i) => i + 1);
  if (indices.join(',') !== expected.join(',')) {
    v.push(`Rule 1: page indices must be 1–${n} exactly once, got [${indices.join(', ')}].`);
  }

  // 2. Page text length. The story pass already enforces this; it is here so a
  // captured or hand-written chapter is held to the same contract.
  for (const page of chapter.pages) {
    const words = wordCount(page.text);
    if (words < PAGE_WORDS.min || words > PAGE_WORDS.max) {
      v.push(`Rule 2: page ${page.index} text is ${words} words, must be ${PAGE_WORDS.min}–${PAGE_WORDS.max}.`);
    }
  }

  // 3. Every page cites a real chain entry.
  for (const page of chapter.pages) {
    if (!byId.has(page.derivedFrom)) {
      v.push(`Rule 3: page ${page.index} derivedFrom "${page.derivedFrom}" matches no chain id.`);
    }
  }

  // 4. All three orders present, at most four each.
  for (const order of [1, 2, 3] as const) {
    const count = chapter.chain.filter((e) => e.order === order).length;
    if (count === 0) v.push(`Rule 4: order ${order} has no entries; all three orders are required.`);
    if (count > EFFECTS_PER_ORDER) {
      v.push(`Rule 4: order ${order} has ${count} entries, cap is ${EFFECTS_PER_ORDER}. Drop the least important, do not grow the array.`);
    }
  }

  // 5. The chain actually chains. The message names the candidate parents
  // outright: this rule once failed twice on the same chapter, spending the
  // retry, because stating the constraint without stating the fix left the
  // model to rediscover which ids were even eligible.
  for (const effect of chapter.chain) {
    if (effect.order === 1) {
      if (!effect.derivedFrom.some((r) => r.kind === 'rule')) {
        v.push(
          `Rule 5: order-1 entry ${effect.id} must reference {"kind":"rule"}. ` +
            'Add it to derivedFrom — a first-order entry comes from the rule itself.',
        );
      }
      continue;
    }
    const parentOrder = effect.order - 1;
    const chains = effect.derivedFrom.some(
      (r) => r.kind === 'effect' && byId.get(r.id)?.order === parentOrder,
    );
    if (!chains) {
      const candidates = chapter.chain.filter((e) => e.order === parentOrder).map((e) => e.id);
      const found = effect.derivedFrom
        .map((r) => (r.kind === 'effect' ? `${r.id} (order ${byId.get(r.id)?.order ?? '?'})` : r.kind))
        .join(', ');
      v.push(
        `Rule 5: order-${effect.order} entry ${effect.id} references [${found}] but none of those is an ` +
          `order-${parentOrder} entry. Add one of [${candidates.join(', ')}] to its derivedFrom array — ` +
          'keep the existing entries, this is an addition, not a replacement.',
      );
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

  // 7 (domain spread) is retired: demanding four domains is what sent every
  // book on a tour of roads, offices and bridges.

  // 8. Some variety of framing.
  const shots = new Set(chapter.pages.map((p) => p.shotType));
  if (shots.size < MIN_DISTINCT_SHOT_TYPES) {
    v.push(`Rule 8: pages use ${shots.size} shot types, need at least ${MIN_DISTINCT_SHOT_TYPES}.`);
  }

  // 9. Entity references resolve, and stay within the prompt budget.
  const entityNames = new Set(chapter.worldCanon.namedEntities.map((e) => e.name));
  for (const page of chapter.pages) {
    if (page.entityRefs.length > PROMPT_LIMITS.entityRefsPerPage) {
      v.push(`Rule 9: page ${page.index} has ${page.entityRefs.length} entityRefs, cap is ${PROMPT_LIMITS.entityRefsPerPage}. Keep the ones that matter — a recurring person and the place — and describe the rest in the imagePrompt.`);
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
      v.push(`Rule 11: styleBible is ${chapter.styleBible.length} characters, cap is ${PROMPT_LIMITS.styleBible}. It rides in every image prompt forever, so it must fit forever.`);
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

  // 13. Lengths that keep the assembled prompt inside what Flux actually reads.
  for (const page of chapter.pages) {
    const length = page.imagePrompt.length;
    if (length > PROMPT_LIMITS.imagePrompt) {
      v.push(`Rule 13: page ${page.index} imagePrompt is ${length} characters, cap is ${PROMPT_LIMITS.imagePrompt}. Cut it to the moment this page shows.`);
    }
    if (length < SCENE_CHARS_MIN) {
      v.push(`Rule 13: page ${page.index} imagePrompt is ${length} characters, need at least ${SCENE_CHARS_MIN}. Add who is in the frame, where, the light, and concrete details from the page text.`);
    }
  }
  for (const entity of chapter.worldCanon.namedEntities) {
    if (entity.visualDescription.length > PROMPT_LIMITS.entityDescriptionMax) {
      v.push(`Rule 13: visualDescription for "${entity.name}" is ${entity.visualDescription.length} characters, cap is ${PROMPT_LIMITS.entityDescription}.`);
    }
  }
  if (chapter.hero.look.length > PROMPT_LIMITS.heroLook) {
    v.push(`Rule 13: hero.look is ${chapter.hero.look.length} characters, cap is ${PROMPT_LIMITS.heroLook}.`);
  }
  for (const effect of chapter.chain) {
    if (wordCount(effect.text) > EFFECT_MAX_WORDS) {
      v.push(`Rule 13: chain entry ${effect.id} is ${wordCount(effect.text)} words, cap is ${EFFECT_MAX_WORDS}.`);
    }
  }

  // 14. Visual laws are checked harder than anything else in canon. A law
  // phrased as an absence is worse than no law at all: the image model cannot
  // exclude, so naming the forbidden thing is simply naming it.
  for (const law of chapter.worldCanon.visualLaws) {
    if (law.length > PROMPT_LIMITS.visualLawMax) {
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

  // 15. The arc must tile the pages. Shape only — how many movements and what
  // they are called is the model's choice.
  const arc = [...chapter.arc].sort((a, b) => a.fromPage - b.fromPage);
  if (arc.length < ARC_MOVEMENTS.min || arc.length > ARC_MOVEMENTS.max) {
    v.push(`Rule 15: arc has ${arc.length} movements, must be ${ARC_MOVEMENTS.min}–${ARC_MOVEMENTS.max}.`);
  }
  let cursor = 1;
  for (const movement of arc) {
    if (movement.fromPage !== cursor) {
      v.push(`Rule 15: movement "${movement.label}" starts at page ${movement.fromPage}, expected ${cursor}. Movements must be contiguous and cover pages 1–${n} with no gaps or overlaps.`);
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
  if (arc.length > 0 && cursor !== n + 1) {
    v.push(`Rule 15: the arc covers pages 1–${cursor - 1}, but there are ${n} pages. Every page must belong to exactly one movement.`);
  }

  // 23. Nothing the world has removed may be named to the illustrator. Every
  // field that reaches Flux is checked — the scene, the hero's look, entity
  // descriptions, laws, styleBible — because a single "his" in one scene is
  // enough to put a man on that plate. This is what "a world without men"
  // drawing men in later pages was.
  const neverDrawn = chapter.worldCanon.neverDrawn.map((w) => w.trim()).filter(Boolean);
  if (neverDrawn.length > 0) {
    const banned = new RegExp(`\\b(?:${neverDrawn.map(escapeRegExp).join('|')})\\b`, 'i');
    const styleBible = chapter.styleBible ?? worldStyleBible ?? '';
    const fields: [string, string][] = [
      ...chapter.pages.map((p): [string, string] => [`page ${p.index} imagePrompt`, p.imagePrompt]),
      ['hero.look', chapter.hero.look],
      ...chapter.worldCanon.namedEntities.map((e): [string, string] => [`visualDescription for "${e.name}"`, e.visualDescription]),
      ...chapter.worldCanon.visualLaws.map((law, i): [string, string] => [`visualLaw ${i + 1}`, law]),
      ['styleBible', styleBible],
    ];
    for (const [where, text] of fields) {
      const hit = banned.exec(text);
      if (hit) {
        v.push(
          `Rule 23: ${where} contains "${hit[0]}", which is in neverDrawn. The illustrator draws every ` +
            'thing it is told about, even to say it is absent. Rewrite it to name only what IS there.',
        );
      }
    }

    // 24. Where the rule changes WHO exists, a vague word for people is filled
    // in from the present-day world. "Commuters on a platform" in a world
    // without men is drawn with men on the platform.
    if (neverDrawn.some((w) => PERSON_WORD_PATTERN.test(w))) {
      for (const page of chapter.pages) {
        const vague = VAGUE_PEOPLE_PATTERN.exec(page.imagePrompt);
        if (vague && !EXPLICIT_PEOPLE_PATTERN.test(page.imagePrompt)) {
          v.push(
            `Rule 24: page ${page.index} imagePrompt says "${vague[0]}" without saying who they are. This ` +
              "world's rules change who exists, and a vague word is drawn from today's world. Name them " +
              'in words that agree with the visual laws.',
          );
        }
      }
    }
  }

  // 25. The reader follows the hero, so the pictures have to show them.
  const heroPages = chapter.pages.filter((p) => p.heroInScene).length;
  const heroPagesMin = Math.ceil(n * HERO_PAGES_MIN_SHARE);
  if (heroPages < heroPagesMin) {
    v.push(
      `Rule 25: the hero is in ${heroPages} of ${n} pictures, need at least ${heroPagesMin}. ` +
        'Set heroInScene on the pages where the text has them there, and put them in those imagePrompts.',
    );
  }

  // 26. Anyone drawn by costume has an age. "A tall slender girl" came out a
  // grown woman on some plates and a teenager on others: Flux picks an age
  // per picture when the prompt does not give one.
  const costumed: [string, string][] = [
    ['hero.look', chapter.hero.look],
    ...chapter.worldCanon.namedEntities
      .filter((e) => e.type === 'person')
      .map((e): [string, string] => [`visualDescription for "${e.name}"`, e.visualDescription]),
  ];
  for (const [where, text] of costumed) {
    if (!AGE_PATTERN.test(text)) {
      v.push(
        `Rule 26: ${where} gives no age. Start it with one — "a girl of nine", "a woman of about forty", ` +
          '"a toddler" — so every picture draws the same person at the same age.',
      );
    }
  }

  return v;
}
