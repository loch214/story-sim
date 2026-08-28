import {
  ARC_MOVEMENTS,
  BASELINE,
  CANON_CAPS,
  EFFECTS_PER_ORDER,
  ENTITY_PAGES_MAX,
  GAZETTEER_OPENING_MAX,
  MOVEMENT_LABEL_MAX_WORDS,
  PAGES_FROM_ONE_EFFECT_MAX,
  PAGES_WITHOUT_ENTITIES_MIN,
  EFFECT_MAX_WORDS,
  LONG_SENTENCE_WORDS,
  MIN_DISTINCT_DOMAINS,
  MIN_DISTINCT_DOMAINS_STORY,
  MIN_DISTINCT_SHOT_TYPES,
  PAGES_PER_CHAPTER,
  PAGE_WORDS,
  PROMPT_LIMITS,
  THROUGH_LINE_PAGES_MIN,
  TRANSITION_NOTE_MAX_WORDS,
  WORLD_TITLE_MAX_WORDS,
  type ChapterDigest,
  type ChapterMode,
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
  /**
   * Which pipeline to run. `rule` derives a world from a change to reality;
   * `story` tells forward something the person has already started. Defaults to
   * `rule`. Before this existed a story was pushed through the rule pipeline,
   * and "a boy fell off his bicycle" came back as twelve pages about municipal
   * transport policy — which is exactly the failure the mode was detected for.
   */
  mode?: ChapterMode;
  /** Frozen from chapter 1. Absent when generating chapter 1. */
  styleBible?: string;
  worldCanon?: WorldCanon;
  chapterDigests?: ChapterDigest[];
  /** Violations from the previous attempt, appended verbatim for the one retry. */
  violations?: string[];
}

export function buildChapterPrompt(input: ChapterPromptInput): string {
  const { rule, chapterNumber, styleBible, worldCanon, chapterDigests, violations } = input;
  const mode = input.mode ?? 'rule';
  const story = mode === 'story';
  const first = chapterNumber === 1;

  const sections: string[] = [];

  sections.push(
    story
      ? `You are telling a short illustrated story.

Somebody has started it and stopped. Your job is to tell it forward and finish it, in
twelve pages. It is a storybook: things happen to somebody, in order, and it ends.

It is NOT an essay about what such an event would mean for society. No policy, no
economics, no statistics, no institutions reacting. If the story is a boy falling off his
bicycle, the book is about that afternoon and what came of it — not about road safety.

Baseline: "${BASELINE}" — this is the ordinary present-day world. Anything strange in it
is strange because the story says so, and everything else stays normal.

The opening you were given: ${rule}
Chapter: ${chapterNumber}`
      : `You are writing a short illustrated book about a world that has changed.

It has to hold together like a world — consequences following from causes — and it has
to read like a book, not a briefing. Both. If you only get one, get the reading.

Baseline: "${BASELINE}" — this world is the present-day world except for the rules
below. Every consequence must be legible as a divergence from the world the reader
already knows. Do not relocate to a fantasy or historical setting.

Rule entering this world now: ${rule}
Chapter: ${chapterNumber}`,
  );

  if (!first && worldCanon) {
    sections.push(`This world already exists.${
      story ? ' Your story happens inside it, and must obey it.' : ''
    } Its canon:

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

A canon reference is IN ADDITION to the effect's normal parent reference, never instead
of it. derivedFrom is an array: an order-3 effect touching a liveTension carries BOTH,
e.g. [{"kind":"effect","id":"e6"},{"kind":"liveTension","index":2}]. Dropping the parent
to make room for the canon reference breaks the chain and the chapter is rejected.

Return a COMPLETE new worldCanon that replaces the one above: carry forward what still
holds, revise what the new rule changes, and drop the least important entry when a cap
would be exceeded.`);
  }

  sections.push(
    story
      ? `FIRST, work out what happens. Do this before writing any prose — the pages are
made from these beats, not the other way round.

Twelve beats, in the order they happen, ids "e1" through "e12" assigned IN ORDER:
e1–e4 are order 1, e5–e8 are order 2, e9–e12 are order 3.

  - Exactly ${EFFECTS_PER_ORDER} beats of order 1: the opening and what follows from it
    within hours.
  - Exactly ${EFFECTS_PER_ORDER} beats of order 2: what those lead to over the following
    days or weeks.
  - Exactly ${EFFECTS_PER_ORDER} beats of order 3: how it settles, or fails to.
  - Each text at most ${EFFECT_MAX_WORDS} words. Write them as events: somebody does
    something, something happens, something is found out.
  - derivedFrom: order-1 beats reference {"kind":"rule"}, meaning the opening. Order-2
    beats reference at least one order-1 beat id. Order-3 beats reference at least one
    order-2 beat id. Each beat is CAUSED by the one it names, not merely later than it.
    EVERY order-2 and order-3 beat needs this parent reference — including the last one.
    Check e9, e10, e11 and e12 individually before you finish: each must name a beat
    from e5–e8. A beat that reaches straight back to the opening, or sideways to another
    order-3 beat, is misfiled and the chapter is rejected for it.
  - Each tagged with the domain it touches. Use at least ${MIN_DISTINCT_DOMAINS_STORY}
    distinct domains — but do NOT go hunting for an economics beat or a politics beat to
    fill a quota. Tag what the beat actually is.

Keep it at human scale throughout. One place, a handful of people, a few days or a few
years. Something must be at stake for somebody, and by beat 12 it is settled — well,
badly, or in a way nobody expected.`
      : `FIRST, derive the causal chain. Do this before writing any prose — the pages
are derived from the chain, not the other way round.

  - Exactly ${EFFECTS_PER_ORDER} first-order effects: direct consequences of the rule.
  - Exactly ${EFFECTS_PER_ORDER} second-order effects: consequences of those.
  - Exactly ${EFFECTS_PER_ORDER} third-order effects: consequences of those.
  - ids "e1" through "e12", assigned IN ORDER: e1–e4 are order 1, e5–e8 are order 2,
    e9–e12 are order 3.
  - Each text at most ${EFFECT_MAX_WORDS} words.
  - Each tagged with one domain. Use at least ${MIN_DISTINCT_DOMAINS} distinct domains
    across the chain.
  - derivedFrom: order-1 effects reference {"kind":"rule"}. Order-2 effects reference at
    least one order-1 effect id. Order-3 effects reference at least one order-2 effect id.
    EVERY order-2 and order-3 effect needs this parent reference — including the last
    one. Check e9, e10, e11 and e12 individually before you finish: each must name an
    effect from e5–e8. A third-order effect that reaches straight back to the rule, or
    to another third-order effect, is not third-order — it is misfiled, and the chapter
    is rejected for it.

Reason rigorously here: second and third order effects should be the ones a thoughtful
person would not have guessed, and should follow necessarily from their parents. This
part is analysis. The pages that come out of it are not.`,
  );

  sections.push(`THEN choose the ARC — the shape this particular ${story ? 'story' : 'premise'} wants.

Do not reach for a default. ${
    story
      ? 'A story that all happens in one night and one that runs over years are not the same shape.'
      : 'A rule that lasts a single day and a rule that reshapes civilisation over ' +
        'generations are not the same story and must not have the same rhythm.'
  }
Ask what span this actually covers, then divide the twelve pages into
${ARC_MOVEMENTS.min}–${ARC_MOVEMENTS.max} movements that fit it.

  - Each movement: a label of at most ${MOVEMENT_LABEL_MAX_WORDS} words, plus fromPage
    and toPage.
  - Contiguous, in order, covering pages 1 to ${PAGES_PER_CHAPTER} with no gaps or
    overlaps. Movements may be different lengths — give the interesting part more pages.
  - Label them for what HAPPENS in them, in plain words. Not "act one", "beginning",
    "setup", "part 2" — those are labels for a template, and this is not a template.

Shapes that fit different ${story ? 'stories' : 'premises'}, as illustrations only — invent your own:
${
    story
      ? `  one night → "before it happened" / "the hour after" / "waiting for morning" /
    "what they told people later"
  something found → "finding it" / "keeping it quiet" / "it gets out" / "afterwards"`
      : `  a rule lasting 24 hours → "the first hour" / "everyone at once" / "the long night" /
    "what was still broken by morning"
  a permanent physical change → "the year the weight went" / "improvising" /
    "the new normal" / "children who never knew the old way"
  a rule that removes something → "noticing" / "the workarounds" / "the settlement"`
  }

The arc governs the pages: they are read in order, and page 7 should feel later than
page 3. Something must develop across the twelve. A reader should feel carried, not
handed a list.`);

  sections.push(`THEN choose the throughLine — see THE VOICE below for what this means and why.
Return it as:
  - role: at most 6 words, an unnamed figure or small group ("the rope crew", "the
    night shift"). Never a name, never a face — same rule as namedEntities.
  - headNoun: ONE word from role, lowercase, exactly as it will appear in page text
    ("crew", "shift"). This is checked mechanically, so it must actually be the word
    you use on the page, not a synonym for it.
  - want: at most 15 words, what this role is trying to do or protect across the book.`);

  sections.push(`THEN write exactly ${PAGES_PER_CHAPTER} pages, indices 1 to
${PAGES_PER_CHAPTER}, following the arc you just chose.

SELECT AND ARRANGE. Do not write one page per ${story ? 'beat' : 'effect'} in the order
you listed them. That produces ${PAGES_PER_CHAPTER} disconnected ${story ? 'snapshots' : 'facts'}
in id order, which is the single worst thing this book can be. The chain is your
groundwork; the pages are what you make from it. So:

  - Choose what is worth showing. Some of your ${EFFECTS_PER_ORDER * 3} ${story ? 'beats' : 'effects'}
    will get no page at all. That is correct — deciding what to leave out is most of what
    makes this a book.
  - Give a strong moment ROOM: at least one ${story ? 'beat' : 'effect'} must carry 2 or
    more consecutive pages, unfolding rather than being stated once. Up to
    ${PAGES_FROM_ONE_EFFECT_MAX}.
  - Order the pages for the reading — the movements of the arc, cause arriving before
    consequence, contrast between neighbours — never by id.
  - derivedFrom still names the ${story ? 'beat' : 'effect'} each page comes from, so the
    reasoning stays checkable. It is a citation, not a running order.

Each page is a MOMENT — a particular time, a particular place, something happening or
just about to. Not a summary of a trend, not an explanation of a system. If a page could
begin "increasingly," or "many people now," rewrite it as the one afternoon when it was
true of someone.

This is the difference, and it is the whole difference:

  REPORT (wrong): "Streetlights illuminate empty avenues precisely at dusk. Deep inside
    the automated substation, cooling fans hum continuously, regulating power grids."
    — nothing happens. It states a condition and could be any page in any order.
  BOOK (right): "The streetlights still come on at dusk, all down the road, for nobody.
    In the substation the fans have run eight months without a service. Something under
    the floor has started to squeal."
    — same facts, but time is passing and something is going wrong.

Verbs of change, not verbs of being. Something is running down, filling up, arriving,
failing, being fixed for the last time.`);

  sections.push(`THE VOICE. This is the part that keeps coming back wrong, so read it twice.

Write like a person telling somebody what happened, out loud, casually — not like a
person writing. This is a picture book somebody reads for pleasure. It is not
literature, not a news report, not a lecture, and not an essay about society.
Contractions are normal ("doesn't", "it's", "they're"). A sentence fragment is fine.
Somebody should read each page once, at normal speed, and get it — no sentence they
have to go back over, and nothing that sounds typed rather than said.

Six hard rules. All six are checked automatically, and a chapter that breaks them is
rejected and rewritten:

  1. NO SENTENCE LONGER THAN ${LONG_SENTENCE_WORDS} WORDS, and most much shorter. One
     idea per sentence. A sentence with a comma holding two thoughts together is usually
     two sentences.
  2. NO SEMICOLONS. Nobody speaks a semicolon.
  3. ORDINARY WORDS. If there is a plain word for the thing, use the plain word. This is
     the single most common way these pages go wrong:
       "subterranean transit systems"                    → "underground trains"
       "the deluge surging down the culvert overwhelms
        the drainage grates"                             → "the water burst through the drains"
       "progressive structural collapse"                 → "it came down a floor at a time"
       "pioneer tree species colonize scorched asphalt"  → "young birches push up through burnt road"
       "ecological carrying capacity"                    → "how many the land can feed"
     Technical vocabulary is right in the CHAIN — that is the groundwork, keep it precise
     there. It is wrong on the page, which is the part somebody actually reads.
  4. VARY SENTENCE LENGTH. At least four of the twelve pages must contain a sentence of
     eight words or fewer. If every sentence lands at the same medium length the page
     reads flat however good the words are. Put a short one in. Three words, or one. Then
     a longer one that gathers a little detail. That rhythm is what makes it sound like a
     person instead of a report.
  5. NO HABITUAL TENSE. "Launches nine times a day", "usually checks the line",
     "increasingly", "these days" — that is how a brochure talks, not how a person tells
     a story. Pick the one occasion it happened and write that: not what is generally
     true, but what somebody saw, once. "Launches nine times a day" becomes "This
     morning it sent up its ninth rocket before lunch." The fact survives; the caption
     tone does not.
  6. DON'T OPEN ON THE LANDMARK. At most ${GAZETTEER_OPENING_MAX} of the twelve pages
     may start with "The [Name] does such-and-such" ("The Spindle rises...", "Halfweight
     Port launches..."). That sentence shape is an exhibit caption. Open on a person
     doing something, an action already underway, or a small detail instead, and let the
     place reveal itself in the sentence that follows.

Two more, judged rather than counted, and just as important:

  - NO ABSTRACT NOUN DOING THE WORK. Not "economic pressure", "social change", "the
    authorities", "resources", "the system", "the population". Show one thing a person
    could point at instead: a queue outside a door, a padlock, a price chalked on a
    board, a bus that stops coming.
  - HAVE A FEELING ABOUT IT. Neutral across all twelve pages is its own monotony. A page
    is allowed to be funny, or sad, or startling, or quietly horrible. Some of these
    books are jokes and some are elegies. Write the one you actually have.

THE THROUGH-LINE. Twelve unrelated facts is the single worst thing this book can be —
worse than any one page being weak. Before writing pages, choose a throughLine: one
unnamed role or small group that a reader can follow across the book (the rope crew,
the night shift, the last ferryman, the family in 4B). Same invariant as everywhere
else: a role, never a name, never a described face. At least ${THROUGH_LINE_PAGES_MIN}
of the twelve pages must put that role in the scene, doing something — checked
automatically against throughLine.headNoun, so use the same word for them throughout
(if headNoun is "crew", say "crew", not "team" on one page and "workers" on another).
The role does not have to be the SUBJECT of the chain — the chain can stay about the
world at large — but it is who the reader watches the world happen to and through.`);

  sections.push(`Continuity is what makes twelve pages a book instead of twelve ${story ? 'snapshots' : 'facts'}:

  - RECURRING PLACES AND OBJECTS carry the story. Put them in namedEntities and bring
    them back in later movements, changed by what has happened. The same tower early and
    late, the same machine working and then abandoned. This is the strongest tool you
    have and the illustrator can draw it consistently — use it on at least two entities.
  - UNNAMED ROLES, not named people: ${story ? '"the boy", "his sister", "the man from the garage"' : '"the last mechanic on the line", "the night crew", "a child born after"'}.
    A role can come back page after page without ever being given a name or a face.
  - NO recurring named character, and no character described by face or features. The
    illustrator generates each page independently and cannot hold a person's face across
    images. Naming someone makes the reader expect a face that will not survive.
    Figures stay in crowds, at mid-distance, backs turned, in silhouette.${
    story
      ? ' The person this story follows is a role in the text and a shape in the pictures: "the boy", never a name and never a face.'
      : ''
  }
  - Let tension build and resolve, or fail to. Something should be at stake by the
    middle and answered, or pointedly unanswered, by the end.
  - VARY THE LOOK. Across the twelve: different times of day, weather, seasons, palette
    emphasis, and scales — a horizon, a room, a pair of hands. Consecutive pages must not
    share a time of day, a dominant light or palette emphasis, or a distance. At least
    ${PAGES_WITHOUT_ENTITIES_MIN} pages go somewhere not
    in namedEntities at all, and no entity appears on more than ${ENTITY_PAGES_MAX} pages.
    A world that is only ever its three landmarks reads as one building.

PAGE ${PAGES_PER_CHAPTER} IS AN ENDING. Not the last item in a list — the note the book
goes out on. It should feel chosen: a final image that answers, echoes or quietly refuses
the opening, and a last line that stops rather than trailing off. Give it a wide or still
frame. Someone finishing this page should feel the book close, not run out.

Each page:
  - text: ${PAGE_WORDS.min}–${PAGE_WORDS.max} words, in the voice above — short
    sentences, ordinary words, something felt. Present the scene rather than explaining
    it. No addressing the reader, no moralising, no summarising what the chapter showed.
  - derivedFrom: the id of the ${story ? 'beat' : 'effect'} this page comes from. A
    citation for checking, not an instruction about order.
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
    applied separately and fights anything you write here. Consecutive pages must not
    share a dominant light or palette emphasis either — see VARY THE LOOK below.
  - entityRefs: at most ${PROMPT_LIMITS.entityRefsPerPage} names from
    worldCanon.namedEntities that appear in this scene. Their descriptions are spliced in
    automatically, so do not repeat their appearance in the imagePrompt. Most pages
    should reference none.
  - altText: one sentence describing the image for a screen reader.`);

  if (first) {
    sections.push(`This is chapter 1, so you also establish what is frozen for this world forever:

  - worldTitle: at most ${WORLD_TITLE_MAX_WORDS} words. ${
      story
        ? 'Name the BOOK, do not restate its opening line. "The Long Way Home", not "A Boy Was Hit By A Car".'
        : 'Name the WORLD rather than the rule. "The Long Fall", not "Gravity Is Half As Strong".'
    }
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
  - activeRules at most ${CANON_CAPS.activeRules}, each with the chapter it entered.${
    story
      ? ' For a story, this is what the story has established about this world that a later chapter must respect — often only one entry, sometimes none.'
      : ''
  }
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
    about who or what is visible, return an empty array — do not invent decoration. An
    ordinary present-day story usually has no visual laws at all, and that is correct.
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
