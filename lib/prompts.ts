import {
  ARC_MOVEMENTS,
  BASELINE,
  CANON_CAPS,
  EFFECTS_PER_ORDER,
  ENTITY_PAGES_MAX,
  MOVEMENT_LABEL_MAX_WORDS,
  PAGES_FROM_ONE_EFFECT_MAX,
  PAGES_WITHOUT_ENTITIES_MIN,
  EFFECT_MAX_WORDS,
  MIN_DISTINCT_DOMAINS,
  MIN_DISTINCT_SHOT_TYPES,
  PAGES_PER_CHAPTER,
  PAGE_WORDS,
  PROMPT_LIMITS,
  TRANSITION_NOTE_MAX_WORDS,
  WORLD_TITLE_MAX_WORDS,
  type ChapterDigest,
  type WorldCanon,
} from './types';

/**
 * Every cap is stated here because Gemini's responseSchema cannot carry array
 * bounds. The prompt asks, the validator enforces, and a failed chapter comes
 * back with its violation list appended to this text.
 */

export function buildPreflightPrompt(input: string): string {
  return `You screen input for an illustrated book generator. Return JSON.

FIRST decide the mode. This matters more than the verdict.

mode "rule" — the person has described how REALITY WORKS differently. A general,
present-tense condition of the world. The book will derive consequences from it.
  "gravity is half as strong"
  "a world without women"
  "lying is physically impossible"

mode "story" — the person has already started TELLING SOMETHING. Particular characters,
particular events, usually past tense, a sequence that has begun and wants finishing.
The book will continue it rather than analyse it.
  "a boy was riding his bicycle and got hit by a car, he woke up and it was a dream"
  "the lighthouse keeper found a door in the rocks that hadn't been there yesterday"
  "she opened the letter twenty years late"

The test: could this be true of a whole world for years, or did it happen to someone on
a particular day? A general condition is "rule". A thing that happened is "story".
When genuinely torn, prefer "story" — a premise can always be told as events, but
forcing events into a general condition loses what the person wrote.

THEN the verdict.

verdict "valid" — usable as it stands, in whichever mode. interpretedRule is their input
lightly tidied, keeping their own words wherever they work.

verdict "coercible" — a bare subject or theme rather than either a rule or a story, but
honestly restatable. Do the restating, and set mode to whichever fits the result.
  "a story about dragons" → rule: "dragons exist and are a normal part of present-day ecology"
  "underwater cities" → rule: "humans can breathe water as easily as air"

verdict "unusable" — empty, gibberish, or a request about how the BOOK looks or sounds
rather than what it is about. Style, tone and genre requests are unusable.
  "make it funny" → unusable
  "in the style of Studio Ghibli" → unusable
  "asdfgh" → unusable
Set mode to "rule" when unusable; it is not read.

interpretedRule: at most 25 words. For mode "rule", a present-tense statement about
reality. For mode "story", the opening situation in the person's own register, kept as
the thing that happens rather than flattened into a premise. Empty string when unusable.

reason: at most 20 words, addressed to the user. Only shown when unusable, so make that
case useful.

Input: ${JSON.stringify(input)}`;
}

export interface ChapterPromptInput {
  rule: string;
  chapterNumber: number;
  /** Frozen from chapter 1. Absent when generating chapter 1. */
  styleBible?: string;
  worldCanon?: WorldCanon;
  chapterDigests?: ChapterDigest[];
  /** Violations from the previous attempt, appended verbatim for the one retry. */
  violations?: string[];
}

export function buildChapterPrompt(input: ChapterPromptInput): string {
  const { rule, chapterNumber, styleBible, worldCanon, chapterDigests, violations } = input;
  const first = chapterNumber === 1;

  const sections: string[] = [];

  sections.push(`You are writing a short illustrated book about a world that has changed.

It has to hold together like a world — consequences following from causes — and it has
to read like a book, not a briefing. Both. If you only get one, get the reading.

Baseline: "${BASELINE}" — this world is the present-day world except for the rules
below. Every consequence must be legible as a divergence from the world the reader
already knows. Do not relocate to a fantasy or historical setting.

Rule entering this world now: ${rule}
Chapter: ${chapterNumber}`);

  if (!first && worldCanon) {
    sections.push(`This world already exists. Its canon:

${JSON.stringify(worldCanon, null, 1)}

Previous chapters:
${(chapterDigests ?? []).map((d) => `  ch${d.chapter} (${d.ruleType}): ${d.rule} — ${d.keyOutcome}`).join('\n')}

The frozen styleBible, which you must NOT restate or change:
${styleBible}

Classify the incoming rule as "additive" or "contradictory". It is contradictory if it
reverses or overrides a rule already in activeRules. If you are unsure, say
"ambiguous" — it will be treated as contradictory, because an explicit change beats a
silent paper-over.

If it is contradictory: move exactly one rule from activeRules into supersededRules with
chapterReversed = ${chapterNumber}, and write a transitionNote of at most
${TRANSITION_NOTE_MAX_WORDS} words describing the changeover itself — the day the old
rule stopped holding, and what that did to a civilisation built around it. The reversal
is the richest material in the chapter; open the pages with it.

If it is additive: leave supersededRules exactly as it is.

CRITICAL: at least one effect in your chain must derive from the existing world — a
{"kind":"invariant","index":N} or {"kind":"liveTension","index":N} reference into the
canon above. A chapter whose chain never touches the existing world has failed. Prefer
interacting with an existing liveTension over spawning unrelated consequences.

Return a COMPLETE new worldCanon that replaces the one above: carry forward what still
holds, revise what the new rule changes, and drop the least important entry when a cap
would be exceeded.`);
  }

  sections.push(`FIRST, derive the causal chain. Do this before writing any prose — the pages
are derived from the chain, not the other way round.

  - Exactly ${EFFECTS_PER_ORDER} first-order effects: direct consequences of the rule.
  - Exactly ${EFFECTS_PER_ORDER} second-order effects: consequences of those.
  - Exactly ${EFFECTS_PER_ORDER} third-order effects: consequences of those.
  - ids "e1" through "e12". order is 1, 2 or 3.
  - Each text at most ${EFFECT_MAX_WORDS} words.
  - Each tagged with one domain. Use at least ${MIN_DISTINCT_DOMAINS} distinct domains
    across the chain.
  - derivedFrom: order-1 effects reference {"kind":"rule"}. Order-2 effects reference at
    least one order-1 effect id. Order-3 effects reference at least one order-2 effect id.

Reason rigorously here: second and third order effects should be the ones a thoughtful
person would not have guessed, and should follow necessarily from their parents. This
part is analysis. The pages that come out of it are not.`);

  sections.push(`THEN choose the ARC — the shape this particular premise wants.

Do not reach for a default. A rule that lasts a single day and a rule that reshapes
civilisation over generations are not the same story and must not have the same rhythm.
Ask what span this premise actually covers, then divide the twelve pages into
${ARC_MOVEMENTS.min}–${ARC_MOVEMENTS.max} movements that fit it.

  - Each movement: a label of at most ${MOVEMENT_LABEL_MAX_WORDS} words, plus fromPage
    and toPage.
  - Contiguous, in order, covering pages 1 to ${PAGES_PER_CHAPTER} with no gaps or
    overlaps. Movements may be different lengths — give the interesting part more pages.
  - Label them for what HAPPENS in them, in this world's own terms. Not "act one",
    "beginning", "setup", "part 2" — those are labels for a template, and this is not a
    template.

Shapes that fit different premises, as illustrations only — invent your own:
  a rule lasting 24 hours → "the first hour" / "everyone at once" / "the long night" /
    "what was still broken by morning"
  a permanent physical change → "the year the weight went" / "improvising" /
    "the new normal" / "children who never knew the old way"
  a rule that removes something → "noticing" / "the workarounds" / "the settlement"

The arc governs the pages: they are read in order, and page 7 should feel later than
page 3. Something must develop across the twelve. A reader should feel carried, not
handed a list.`);

  sections.push(`THEN write exactly ${PAGES_PER_CHAPTER} pages, indices 1 to
${PAGES_PER_CHAPTER}, following the arc you just chose.

SELECT AND ARRANGE. Do not write one page per effect in the order you listed them.
That produces ${PAGES_PER_CHAPTER} disconnected facts in id order, which is the single
worst thing this book can be. The chain is your research; the pages are what you make
from it. So:

  - Choose the effects worth dramatising. Some of your ${EFFECTS_PER_ORDER * 3} effects
    will get no page at all. That is correct — deciding what to leave out is most of what
    makes this a book.
  - Give a strong moment ROOM: at least one effect must carry 2 or more consecutive
    pages, unfolding rather than being stated once. Up to ${PAGES_FROM_ONE_EFFECT_MAX}.
  - Order the pages for the reading — the arc's movements, cause arriving before
    consequence, contrast between neighbours — never by effect id.
  - derivedFrom still names the effect each page dramatises, so the reasoning stays
    checkable. It is a citation, not a running order.

Write them as a book, not a survey. Each page is a MOMENT — a particular time, a
particular place, something happening or just about to. Not a summary of a trend, not an
explanation of a system. If a page could begin "increasingly," or "many people now,"
rewrite it as the one afternoon when it was true of someone.

This is the difference, and it is the whole difference:

  REPORT (wrong): "Streetlights illuminate empty avenues precisely at dusk. Deep inside
    the automated substation, cooling fans hum continuously, regulating power grids."
    — nothing happens. It states a condition and could be any page in any order.
  BOOK (right): "The streetlights still come on at dusk, all down the avenue, for nobody.
    In the substation the fans have been running eight months without a service, and
    somewhere under the floor a bearing has begun to sing."
    — same facts, but time is passing and something is going wrong.

Verbs of change, not verbs of being. Something is running down, filling up, arriving,
failing, being repaired for the last time.

THE VOICE. Write like a good writer talking to a normal reader. Not dumbed down, not
childish, and not literary either — just natural, and enjoyable to read.

  - ORDINARY WORDS. If there is a plain word for the thing, use the plain word. This is
    the single most common way these pages go wrong:
      "subterranean transit systems"                    → "underground trains"
      "the deluge surging down the culvert overwhelms
       drainage grates"                                 → "the water burst through the drains"
      "progressive structural collapse"                 → "it came down a floor at a time"
      "pioneer tree species colonize scorched asphalt"  → "young birches push up through burnt road"
      "ecological carrying capacity"                    → "how many the land can feed"
    Technical vocabulary is right in the CHAIN — that is analysis, keep it precise there.
    It is wrong on the page, which is the part somebody actually reads.

  - VARY SENTENCE LENGTH. This matters as much as word choice. If every sentence runs to
    the same medium length the page reads flat however good the words are. Put a short
    one in — three words, or one. Then a long one that runs on and gathers detail. The
    rhythm is what makes it sound like a person instead of a report.

  - HAVE A FEELING ABOUT IT. Neutral across all twelve pages is its own monotony. A page
    is allowed to be funny, or sad, or startling, or quietly horrible. Some of these
    worlds are jokes and some are elegies; write the one you actually have.

Continuity is what makes twelve pages a book instead of twelve facts:

  - RECURRING PLACES AND OBJECTS carry the story. Put them in namedEntities and bring
    them back in later movements, changed by what has happened. The same tower early and
    late, the same machine working and then abandoned. This is the strongest tool you
    have and the illustrator can draw it consistently — use it on at least two entities.
  - UNNAMED ROLES, not named people: "the last mechanic on the line", "the night crew",
    "a child born after". A role can return without being the same individual.
  - NO recurring named character, and no character described by face or features. The
    illustrator generates each page independently and cannot hold a person's face across
    images. Naming someone makes the reader expect a face that will not survive.
    Figures stay in crowds, at mid-distance, backs turned, in silhouette.
  - Let tension build and resolve, or fail to. Something should be at stake by the
    middle and answered, or pointedly unanswered, by the end.
  - VARY THE LOOK. Across the twelve: different times of day, weather, seasons, and
    scales — a horizon, a room, a pair of hands. Consecutive pages must not share a time
    of day and a distance. At least ${PAGES_WITHOUT_ENTITIES_MIN} pages go somewhere not
    in namedEntities at all; no entity appears on more than ${ENTITY_PAGES_MAX} pages.
    A world that is only ever its three landmarks reads as one building.

PAGE ${PAGES_PER_CHAPTER} IS AN ENDING. Not the last item in a list — the note the book
goes out on. It should feel chosen: a final image that answers, echoes or quietly refuses
the opening, and a last line that stops rather than trailing off. Give it a wide or still
frame. Someone finishing this page should feel the book close, not run out.

Each page:
  - text: ${PAGE_WORDS.min}–${PAGE_WORDS.max} words, in the voice described above —
    ordinary words, varied sentence lengths, something felt. Present the scene rather
    than explaining it; trust the reader to infer the system behind it. No addressing the
    reader, no moralising, no summarising what the chapter has shown.
  - derivedFrom: the id of the effect this page dramatises. A citation for checking, not
    an instruction about order.
  - shotType: use at least ${MIN_DISTINCT_SHOT_TYPES} distinct values across the twelve.
  - imagePrompt: UP TO ${PROMPT_LIMITS.imagePrompt} characters, and use them. This is the
    only part of the image instruction that differs from page to page — everything else
    the illustrator sees is identical across all twelve, so a thin scene here means a
    plate that looks like every other plate. Aim for ${Math.round(PROMPT_LIMITS.imagePrompt * 0.6)}+
    characters of specific visual description: the subject and what it is doing, the
    setting, the arrangement of things in the frame, the distance, the time of day, the
    weather and quality of light, the colours and textures actually present, what is worn
    or carried, what is broken or new. Describe the SCENE ONLY. No style words of any
    kind — no "illustration", "photorealistic", "anime", "in the style of". Style is
    applied separately and fights anything you write here.
  - entityRefs: at most ${PROMPT_LIMITS.entityRefsPerPage} names from
    worldCanon.namedEntities that appear in this scene. Their descriptions are spliced in
    automatically, so do not repeat their appearance in the imagePrompt. Most pages
    should reference none.
  - altText: one sentence describing the image for a screen reader.`);

  if (first) {
    sections.push(`This is chapter 1, so you also establish what is frozen for this world forever:

  - worldTitle: at most ${WORLD_TITLE_MAX_WORDS} words, naming the WORLD rather than the
    rule. "The Long Fall", not "Gravity Is Half As Strong".
  - styleBible: ONE string, AT MOST ${PROMPT_LIMITS.styleBible} CHARACTERS, describing art
    style, palette, architecture, technology level and how figures look, for a 2D cartoon
    illustrated book. It is prepended to every image prompt in this world forever, so it
    must be specific, self-contained and durable. Describe what IS, never what is not.
    Where it describes figures, it must agree with visualLaws — the two are read together
    on every page, and a styleBible that contradicts a law will fight it.
  - ruleType is "additive" and supersededRules is empty — there is nothing yet to
    contradict.`);
  }

  sections.push(`worldCanon:
  - baseline must be exactly "${BASELINE}"
  - activeRules at most ${CANON_CAPS.activeRules}, each with the chapter it entered
  - physicsDeltas at most ${CANON_CAPS.physicsDeltas}
  - invariants at most ${CANON_CAPS.invariants} — facts later chapters must never contradict
  - namedEntities at most ${CANON_CAPS.namedEntities}, each visualDescription at most
    ${PROMPT_LIMITS.entityDescription} characters, concrete and visual so the same tower
    is drawn the same way in chapter 5
  - visualLaws: at most ${CANON_CAPS.visualLaws}, each at most ${PROMPT_LIMITS.visualLaw}
    characters. THIS IS THE MOST IMPORTANT FIELD FOR THE ILLUSTRATIONS. See below.
  - liveTensions at most ${CANON_CAPS.liveTensions} — unresolved pressures a later rule
    can interact with
  - supersededRules at most ${CANON_CAPS.supersededRules}

If a cap would be exceeded, drop the least important entry. Never exceed it.

VISUAL LAWS — read this twice.

The illustrator draws each page from its imagePrompt alone. It has not read the rule,
the chain, or the page text. It knows only what the image prompt tells it, and where the
prompt is silent it falls back on the ordinary present-day world. So if the rule changes
who or what appears in a scene and the image prompt does not say so, the picture will
quietly contradict the rule.

visualLaws are the fix: the handful of things that are ALWAYS true on screen in this
world. They are attached to every image prompt in this world automatically.

  - State what IS PRESENT. Never what is missing. The illustrator cannot process
    negation — it has no way to exclude anything, and naming a thing in order to
    forbid it makes that thing MORE likely to be drawn.
      rule "a world without men"
        WRONG: "no men anywhere"       (draws men)
        WRONG: "women only, no males"  (draws men)
        RIGHT: "every person is a woman or a girl, all ages"
      rule "humans live only 10 years"
        RIGHT: "every adult pictured looks between four and nine years old"
      rule "gravity is half as strong"
        RIGHT: "hair, cloth and dust hang and drift in every scene"
  - Visual and concrete. Something a person could look at a picture and check.
    Economic and political consequences do not belong here.
  - Only what the rules actually change about appearances. If the rules change nothing
    about who or what is visible, return an empty array — do not invent decoration.
  - Write them to survive being read on their own, out of context.

Then write every imagePrompt so it AGREES with these laws. A scene describing a crowd in
a world whose law is "every person is a woman or a girl" must say women, not "commuters"
— the laws reinforce the scene, they do not excuse it from being specific.

diagramHints: palette is 3 to 5 hex colours drawn from the styleBible; motif is at most
8 words naming a decorative motif for the reasoning diagram.`);

  if (violations?.length) {
    sections.push(`Your previous attempt was rejected. Fix every one of these and change nothing else:

${violations.map((v) => `  - ${v}`).join('\n')}`);
  }

  return sections.join('\n\n');
}
