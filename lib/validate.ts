import { assembleImagePrompt } from './prompt';
import {
  ARC_MOVEMENTS,
  CANON_CAPS,
  EFFECTS_PER_ORDER,
  EFFECT_MAX_WORDS,
  ENTITY_PAGES_MAX,
  GAZETTEER_OPENING_MAX,
  GAZETTEER_OPENING_PATTERN,
  HABITUAL_PATTERN,
  MOVEMENT_LABEL_MAX_WORDS,
  PAGES_FROM_ONE_EFFECT_MAX,
  PAGES_WITHOUT_ENTITIES_MIN,
  PAGES_WITH_SHORT_SENTENCE_MIN,
  SHORT_SENTENCE_WORDS,
  LONG_SENTENCE_WORDS,
  LITERARY_PUNCTUATION,
  STIFF_REGISTER_PATTERN,
  sentences,
  MIN_DISTINCT_DOMAINS,
  MIN_DISTINCT_DOMAINS_STORY,
  MIN_DISTINCT_SHOT_TYPES,
  NEGATION_PATTERN,
  PAGES_PER_CHAPTER,
  PAGE_WORDS,
  PROMPT_LIMITS,
  THROUGH_LINE_PAGES_MIN,
  TRANSITION_NOTE_MAX_WORDS,
  WORLD_TITLE_MAX_WORDS,
  coerceRuleType,
  wordCount,
  type ChapterMode,
  type ChapterResponse,
  type Effect,
  type WorldCanon,
} from './types';

/**
 * The scene's minimum share of the assembled image prompt. See rule 19.
 * Budgeted in lib/types.ts PROMPT_LIMITS to land comfortably above this once
 * styleBible and laws are filled to their caps.
 */
const SCENE_SHARE_MIN = 0.4;

/** headNoun is model-authored text spliced into a RegExp; escape it first. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface ValidateOptions {
  chapterNumber: number;
  /** The canon this chapter is superseding. Absent for chapter 1. */
  priorCanon?: WorldCanon;
  /**
   * Which pipeline wrote this chapter. Defaults to `rule`, so every existing
   * call site keeps the behaviour it had. Only rule 7 differs: a story follows
   * a few people through one sequence of events, and demanding it span four
   * domains is what turned a boy on a bicycle into a report on transport
   * policy. See lib/prompts.ts.
   */
  mode?: ChapterMode;
  /**
   * The world's frozen styleBible — `chapter.styleBible` for chapter 1,
   * the stored world's for chapter 2+ (it is not part of `WorldCanon`). Used
   * only by rule 19, to assemble the same prompt the illustrator will see.
   */
  worldStyleBible?: string;
}

/**
 * The rules of docs/SCHEMA.md § Validation, run to completion rather than
 * short-circuiting: the caller appends the whole list to the retry prompt, so
 * a partial list wastes the one retry we allow.
 */
export function validateChapter(
  chapter: ChapterResponse,
  { chapterNumber, priorCanon, mode = 'rule', worldStyleBible }: ValidateOptions,
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

  // 5. The chain actually chains. The message names the candidate parents
  // outright: this rule once failed twice on the same chapter, spending the
  // retry, because stating the constraint without stating the fix left the
  // model to rediscover which ids were even eligible.
  for (const effect of chapter.chain) {
    if (effect.order === 1) {
      if (!effect.derivedFrom.some((r) => r.kind === 'rule')) {
        v.push(
          `Rule 5: order-1 effect ${effect.id} must reference {"kind":"rule"}. ` +
            'Add it to derivedFrom — a first-order effect comes from the rule itself.',
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
        `Rule 5: order-${effect.order} effect ${effect.id} references [${found}] but none of those is an ` +
          `order-${parentOrder} effect. Add one of [${candidates.join(', ')}] to its derivedFrom array — ` +
          'keep the existing entries, this is an addition, not a replacement. ' +
          `Every order-${effect.order} effect must name the order-${parentOrder} effect it was caused by.`,
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

  // 7 & 8. Variety, so the atlas does not become a monoculture.
  const domains = new Set(chapter.chain.map((e) => e.domain));
  const minDomains = mode === 'story' ? MIN_DISTINCT_DOMAINS_STORY : MIN_DISTINCT_DOMAINS;
  if (domains.size < minDomains) {
    v.push(`Rule 7: chain spans ${domains.size} domains, need at least ${minDomains}.`);
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

  // 18. Voice, and PAGE TEXT ONLY — the chain is the reasoning layer and stays
  // precise. Four checkable symptoms of "this does not read like normal
  // English": a sentence that runs on like a novel, a semicolon nobody would
  // say out loud, reaching for a technical or academic word where an ordinary
  // one exists, and every sentence arriving at the same medium-long shape.
  let pagesWithShortSentence = 0;
  for (const page of chapter.pages) {
    const parts = sentences(page.text);
    if (parts.some((s) => wordCount(s) <= SHORT_SENTENCE_WORDS)) {
      pagesWithShortSentence++;
    }
    for (const sentence of parts) {
      const length = wordCount(sentence);
      if (length > LONG_SENTENCE_WORDS) {
        v.push(
          `Rule 18: page ${page.index} has a ${length}-word sentence, cap is ${LONG_SENTENCE_WORDS}: ` +
            `"${sentence.slice(0, 60)}…". Break it into two. Page text is somebody telling you what happened, ` +
            'not a novel — one idea per sentence.',
        );
      }
    }
    if (LITERARY_PUNCTUATION.test(page.text)) {
      v.push(
        `Rule 18: page ${page.index} uses a semicolon. Nobody speaks a semicolon. ` +
          'Use a full stop and two short sentences.',
      );
    }
    const stiff = STIFF_REGISTER_PATTERN.exec(page.text);
    if (stiff) {
      v.push(
        `Rule 18: page ${page.index} uses "${stiff[0]}". Page text is for a normal reader — ` +
          'use the ordinary word for it ("underground trains", not "subterranean transit systems"). ' +
          'Keep the technical register in the chain, where it belongs.',
      );
    }
    // 21. The habitual register — "how things generally are" rather than "what
    // happened, once" — is the precise cause of the infographic-caption feel:
    // present tense is fine, generalising is not.
    const habitual = HABITUAL_PATTERN.exec(page.text);
    if (habitual) {
      v.push(
        `Rule 21: page ${page.index} says how things generally are ("${habitual[0]}"). ` +
          'Write the one occasion when it happened to somebody, not the pattern it fits.',
      );
    }
  }
  if (pagesWithShortSentence < PAGES_WITH_SHORT_SENTENCE_MIN) {
    v.push(
      `Rule 18: only ${pagesWithShortSentence} of ${PAGES_PER_CHAPTER} pages contain a sentence of ${SHORT_SENTENCE_WORDS} words or fewer, ` +
        `need at least ${PAGES_WITH_SHORT_SENTENCE_MIN}. Every sentence is landing at the same medium length, which is what makes the prose read flat. Vary it.`,
    );
  }

  // 20. The through-line has to actually recur, or it is a field nobody reads
  // rather than a thread carrying the book. headNoun is one word from the role
  // precisely so this is checkable without the model self-reporting.
  const headNoun = chapter.throughLine.headNoun.trim();
  if (headNoun) {
    const headNounPattern = new RegExp(`\\b${escapeRegExp(headNoun)}\\b`, 'i');
    const carryingPages = chapter.pages.filter((page) => headNounPattern.test(page.text)).length;
    if (carryingPages < THROUGH_LINE_PAGES_MIN) {
      v.push(
        `Rule 20: throughLine.headNoun "${headNoun}" appears on ${carryingPages} of ${PAGES_PER_CHAPTER} pages, ` +
          `need at least ${THROUGH_LINE_PAGES_MIN}. The through-line has to actually carry the book from page to page, not just describe it in the field.`,
      );
    }
  }

  // 22. Every page opening on "The Spindle rises…" is the gazetteer rhythm —
  // an exhibit caption, not a moment. Most pages should open somewhere else:
  // mid-action, on a person, on a detail.
  const gazetteerOpenings = chapter.pages.filter((page) => GAZETTEER_OPENING_PATTERN.test(page.text.trim())).length;
  if (gazetteerOpenings > GAZETTEER_OPENING_MAX) {
    v.push(
      `Rule 22: ${gazetteerOpenings} of ${PAGES_PER_CHAPTER} pages open on "The [Name]…", cap is ${GAZETTEER_OPENING_MAX}. ` +
        'That is a caption to an exhibit, not a moment. Open most pages on an action, a person, or a detail instead.',
    );
  }

  // 16. Pages are SELECTED from the chain, not a printout of it. Left to itself
  // the model emits one page per node in id order, which is what made the book
  // read as twelve disconnected facts: no selection, no arrangement, no reason
  // for page 7 to follow page 6 beyond the numbering. Requiring at least one
  // effect to carry several pages forces a moment to be given room, and
  // therefore forces some other effect to go undramatised — which is the
  // editorial judgement that was missing.
  const pagesPerEffect = new Map<string, number>();
  for (const page of chapter.pages) {
    pagesPerEffect.set(page.derivedFrom, (pagesPerEffect.get(page.derivedFrom) ?? 0) + 1);
  }
  const busiest = Math.max(0, ...pagesPerEffect.values());
  if (busiest < 2) {
    v.push(
      'Rule 16: every effect has at most one page, so the chapter is a printout of the chain rather than a book made from it. ' +
        'At least one effect must carry 2 or more pages — let one moment unfold across consecutive pages — which means at least one other effect gets no page at all. Choose which.',
    );
  }
  if (busiest > PAGES_FROM_ONE_EFFECT_MAX) {
    const worst = [...pagesPerEffect.entries()].find(([, n]) => n === busiest);
    v.push(`Rule 16: effect ${worst?.[0]} carries ${busiest} pages, cap is ${PAGES_FROM_ONE_EFFECT_MAX}. The chapter must not collapse onto one idea.`);
  }
  const inPageOrder = [...chapter.pages].sort((a, b) => a.index - b.index).map((p) => p.derivedFrom);
  if (inPageOrder.join(',') === chapter.chain.map((e) => e.id).join(',')) {
    v.push('Rule 16: the pages walk the chain in its declared order, one node each. Page order must serve the reading, not the node numbering.');
  }

  // 17. Named entities recur to make the book cohere, but a book set entirely
  // in three places has no world around it. Caps the repetition and reserves
  // pages that must go somewhere new.
  // Pages are tracked, not just counted: "appears on 6 of 12, cap is 5" tells
  // the model it overshot but not where, so repairing it means re-deriving the
  // whole page set from scratch — and the one retry gets spent reintroducing
  // the same fault. Naming the pages makes the fix a deletion.
  const entityUse = new Map<string, number[]>();
  for (const page of chapter.pages) {
    for (const name of new Set(page.entityRefs)) {
      entityUse.set(name, [...(entityUse.get(name) ?? []), page.index]);
    }
  }
  for (const [name, pages] of entityUse) {
    if (pages.length > ENTITY_PAGES_MAX) {
      v.push(
        `Rule 17: "${name}" appears on ${pages.length} of ${PAGES_PER_CHAPTER} pages, cap is ${ENTITY_PAGES_MAX}. ` +
          `It is on pages ${pages.join(', ')} — remove it from entityRefs on ${pages.length - ENTITY_PAGES_MAX} ` +
          'of those, choosing the pages where it matters least, and describe the place in that page\'s ' +
          'imagePrompt instead. Entities should recur, not dominate.',
      );
    }
  }
  const freshPages = chapter.pages.filter((p) => p.entityRefs.length === 0).length;
  if (freshPages < PAGES_WITHOUT_ENTITIES_MIN) {
    v.push(`Rule 17: only ${freshPages} pages go somewhere not already named, need at least ${PAGES_WITHOUT_ENTITIES_MIN}. The world has to be bigger than its landmarks.`);
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

  // 19. The scene must dominate the assembled image prompt. Every plate in a
  // chapter shares the styleBible and the laws verbatim, so whatever the scene
  // is short of, the shared prefix eats — and when that prefix led the prompt,
  // every plate looked the same regardless of how varied the scenes were.
  // Checked on the assembled prompt, not the raw imagePrompt field, because
  // that is what the illustrator actually sees.
  const sceneShareStyleBible = chapter.styleBible ?? worldStyleBible;
  if (sceneShareStyleBible !== undefined) {
    const styleBible = sceneShareStyleBible;
    for (const page of chapter.pages) {
      const entities = page.entityRefs
        .slice(0, PROMPT_LIMITS.entityRefsPerPage)
        .map((name) => chapter.worldCanon.namedEntities.find((e) => e.name === name))
        .filter((e): e is (typeof chapter.worldCanon.namedEntities)[number] => e !== undefined);
      const assembled = assembleImagePrompt(styleBible, page, entities, chapter.worldCanon.visualLaws);
      const share = page.imagePrompt.length / assembled.prompt.length;
      if (share < SCENE_SHARE_MIN) {
        // Report the target in characters, not just the percentage it missed.
        // The model never sees the assembled prompt, so a bare "38%, need 40%"
        // asks it to hit a ratio against a string it cannot inspect — it has no
        // way to know whether that means adding ten words or ninety. `rest` is
        // the shared material this page carries; the scene has to be
        // SHARE/(1-SHARE) of it to clear the floor.
        const rest = assembled.prompt.length - page.imagePrompt.length;
        const needed = Math.ceil((rest * SCENE_SHARE_MIN) / (1 - SCENE_SHARE_MIN));
        v.push(
          `Rule 19: page ${page.index}'s scene is ${page.imagePrompt.length} characters, ` +
            `${Math.round(share * 100)}% of its assembled image prompt, and needs to be at least ` +
            `${Math.round(SCENE_SHARE_MIN * 100)}%. Rewrite this imagePrompt to at least ${needed} ` +
            `characters (cap ${PROMPT_LIMITS.imagePrompt}) — add specific visual detail, do not pad. ` +
            'The styleBible and visual laws are identical on every plate, so a thin scene here ' +
            'means a plate that looks like every other plate.' +
            (page.entityRefs.length > 0
              ? ` Dropping an entityRef from this page would lower the bar to ${Math.ceil(
                  ((rest - PROMPT_LIMITS.entityDescription) * SCENE_SHARE_MIN) / (1 - SCENE_SHARE_MIN),
                )}.`
              : ''),
        );
      }
    }
  }

  return v;
}
