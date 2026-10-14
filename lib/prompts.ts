import {
  ARC_MOVEMENTS,
  BASELINE,
  CANON_CAPS,
  EFFECTS_PER_ORDER,
  EFFECT_MAX_WORDS,
  MIN_DISTINCT_SHOT_TYPES,
  MOVEMENT_LABEL_TARGET_WORDS,
  PAGES,
  PAGE_WORDS,
  PROMPT_LIMITS,
  SCENE_CHARS_TARGET,
  TRANSITION_NOTE_MAX_WORDS,
  WORLD_TITLE_MAX_WORDS,
  wordCount,
  type ChapterDigest,
  type ChapterMode,
  type WorldCanon,
} from './types';

/**
 * A chapter is written in two passes, and the split is the point.
 *
 * 1. THE STORY (`buildStoryPrompt`) — plain prose, no JSON, almost no rules.
 *    One person to follow, something they want, a turn, an ending. This is
 *    the part language models are good at, and it was being smothered: the
 *    old single prompt asked for a twelve-node causal chain first and pages
 *    citing it second, under two dozen counted constraints, inside a JSON
 *    field. Whatever the voice section said, the skeleton was a list of
 *    effects, and the book read like one.
 *
 * 2. THE PLATES (`buildPlatesPrompt`) — JSON. Reads the finished story and
 *    produces everything a machine needs: styleBible, canon, visual laws, the
 *    hero's look, the reasoning chain, the arc, and one image prompt per page.
 *    It never returns page text, so its retry can never damage the prose.
 *
 * Caps that Gemini's responseSchema cannot carry are stated in prompt 2 and
 * enforced in lib/validate.ts.
 */

export function buildPreflightPrompt(input: string): string {
  return `You screen input for an illustrated book generator. Return JSON.

FIRST decide the mode. This matters more than the verdict.

mode "rule" — the person has described how REALITY WORKS differently. A general,
present-tense condition of the world. The book will tell a story set in that world.
  "gravity is half as strong"
  "a world without women"
  "lying is physically impossible"

mode "story" — the person has already started TELLING SOMETHING. Particular characters,
particular events, usually past tense, a sequence that has begun and wants finishing.
The book will continue it.
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
  /** `rule`: a story set in a changed world. `story`: continue what they started. */
  mode?: ChapterMode;
  /** Frozen from chapter 1. Absent when generating chapter 1. */
  styleBible?: string;
  worldCanon?: WorldCanon;
  chapterDigests?: ChapterDigest[];
}

// ── Step 1: the story ─────────────────────────────────────────────────────

export interface StoryPromptInput extends ChapterPromptInput {
  /** What was wrong with the previous attempt, for the one retry. */
  problems?: string[];
}

function existingWorld(canon: WorldCanon, digests: ChapterDigest[] = []): string {
  const list = (items: string[]) => (items.length ? items.map((item) => `  - ${item}`).join('\n') : '  (none)');
  return `Rules already in force:
${list(canon.activeRules.map((r) => `${r.rule} (since chapter ${r.enteredChapter})`))}

Facts about this world that must not be contradicted:
${list(canon.invariants)}

What it looks like, always:
${list(canon.visualLaws)}

Places and things that already exist there:
${list(canon.namedEntities.map((e) => `${e.name} — ${e.visualDescription}`))}

Still unresolved:
${list(canon.liveTensions)}

What happened in earlier chapters:
${list(digests.map((d) => `chapter ${d.chapter} ("${d.rule}"): ${d.keyOutcome}`))}`;
}

export function buildStoryPrompt(input: StoryPromptInput): string {
  const { rule, chapterNumber, worldCanon, chapterDigests, problems } = input;
  const story = (input.mode ?? 'rule') === 'story';
  const first = chapterNumber === 1;
  const sections: string[] = [];

  sections.push('You are writing a picture book.');

  if (story) {
    sections.push(`Somebody started a story and stopped. Tell it forward and finish it.

  ${rule}

It happens in the ordinary present-day world. Anything strange in it is strange because
the story says so. Keep it at human scale: what happened to these people, over an
afternoon or a few years — not what it meant for society. No policy, no statistics, no
news reports, no experts explaining.`);
  } else {
    sections.push(`The book is set in the present-day world with one thing changed:

  ${rule}

Everything else is as it is today — towns, schools, phones, buses, families — except
where this change would alter it.

Write a story that HAPPENS in this world. Pick one person, or a small group (two
sisters, a crew of three, a family), whose life this change gets into, and tell what
happened to them. Use the two or three consequences of the change that matter to THIS
plot, and leave the rest out.

The trouble in the story must come FROM the change. Ask: what goes wrong, or what
becomes possible, only because of it? That is the story. If the same story would work
just as well in our world — a lost letter, a storm, a missing cat — it is the wrong
story, however well it is told. The reader should finish the book understanding
something about this world they could not have guessed from the rule alone.

Tell the reader plainly, on the first page or two, what is different about this world —
in one or two simple sentences, the way a storyteller would: "In Wren's town, nobody
lived past ten. Grandparents were nine." After that, let the story show it. The reader
must never have to guess at the rule from clues.

Before you write, work out what ordinary life looks like under this rule — how old
people are, who looks after whom, what jobs and families look like — and keep every
detail consistent with it. If people only live to ten, nobody has grey stubble.

Work the consequences out the way a thoughtful adult would believe them — never from
clichés or stereotypes about the people who remain. In a world without men, women are
still tall and strong, still carpenters, roofers and pilots; the change is somewhere
more interesting than who can lift a ladder.

A book that visits a road, then a factory, then a bridge, one consequence per page, is a
tour, not a story. That is the one thing this book must not be.`);
  }

  if (!first && worldCanon) {
    sections.push(`This is chapter ${chapterNumber}. The world already exists, and your story happens in
it as it is now:

${existingWorld(worldCanon, chapterDigests)}

${story ? 'The new story' : `The new change ("${rule}")`} arrives in that world. Let the reader feel the old
rules and the new one at the same time — the most interesting stories here are where they
rub against each other. If the new change reverses an old rule, the day it stopped
holding is a good place for the story to happen. You may come back to a character or a
place from an earlier chapter, or follow somebody new.`);
  }

  sections.push(`WHAT MAKES IT A STORY

- Somebody the reader follows from the first page to the last. You may give them a name.
- They want something, and something is in the way.
- Every page happens BECAUSE of the page before it. Pages joined by "and then" are a list.
  Pages joined by "but" and "so" are a story.
- It gets harder before it gets better — or worse. Somewhere past the middle there is a
  turn: a choice, a discovery, a mistake, a surprise.
- It ends. The last page answers the first — the same place, the same object or the same
  words, changed by what happened. Do not stop because you ran out of pages, and do not
  end on a moral.
- Every question the story raises gets answered. If a page says "nobody has lived there
  for years", the reader must find out who the letter was for. A mystery left hanging
  reads as a mistake, not an ending.
- A few places that keep coming back are better than a new place on every page.`);

  sections.push(`HOW IT SOUNDS

Like a picture book read aloud to an eight-year-old. Write in simple, everyday English:
the words a child knows, or someone who learned English as a second language. If there is
a simpler word, use it — "quiet" not "hushed", "said softly" not "murmured", "very tired"
not "weary". Short sentences. Say things straight: no poetic comparisons that need
working out ("like a clock with its spring snapped"), no fancy description of smells and
textures. Characters say what they feel and want, out loud.

Every page should make clear what is happening and why it matters. A reader who reads
only the text should be able to tell the whole story back to you.

Some dialogue. Funny, sad, scary or tender are all allowed — but plain.

Show events happening, not systems working:
  Not this: "Streetlights illuminate empty avenues precisely at dusk. In the substation,
    cooling fans hum continuously, regulating the power grid."
  This: "The streetlights still came on at dusk, all down the road, for nobody. Mo counted
    them from the roof. Forty-one. Then, one night, forty."`);

  sections.push(`THE PICTURES

Every page gets one illustration, drawn from that page alone. So every page needs
something to SEE happening: somebody doing something, somewhere. A page that is only
thoughts or explanation gives the illustrator nothing to draw.

Never describe a face in detail. A coat, a hat, a bag, a colour — the pictures can keep
those the same from page to page. A face they cannot.${
    story
      ? ''
      : `

If the change alters who or what exists — no men, no dogs, everyone small — make sure
every page is consistent with it. The pictures will follow your text.`
  }`);

  sections.push(`LENGTH

Between ${PAGES.min} and ${PAGES.max} pages. Use the number this story needs to end properly:
${PAGES.min} if it is done, up to ${PAGES.max} if the ending needs the room. Most pages 20–60 words. A page at
the big moment can be a single line. No page over ${PAGE_WORDS.max} words.`);

  sections.push(`FORMAT — exactly this, with nothing before or after it. Plan first, then write. The
PLAN is for you; the reader never sees it, so keep it short and plain.

PLAN
TROUBLE: <${story ? 'what goes wrong, or what is at stake, as the story goes on' : 'what goes wrong, or becomes possible, ONLY because of the change'}>
WANT: <what the hero wants>
IN THE WAY: <what stops them>
TURN: <the choice, discovery or mistake past the middle>
ENDING: <how it ends, and how the last page answers the first>
QUESTIONS: <every mystery or promise the story sets up, and the page that answers it>

${first ? `TITLE: <the book's name, at most ${WORLD_TITLE_MAX_WORDS} words — ${story ? 'not its first line' : 'name the world or the story, not the rule'}>\n` : ''}SUMMARY: <one sentence saying what happened, for whoever writes the next chapter>
HERO: <who the story follows, the way the text refers to them, and how old they are — "June, a girl of twelve">
PAGE 1
<the text of page 1>
PAGE 2
<the text of page 2>
…and so on to the last page.`);

  if (problems?.length) {
    sections.push(`Your previous attempt could not be used:

${problems.map((p) => `  - ${p}`).join('\n')}

Write it again, fixing that.`);
  }

  return sections.join('\n\n');
}

export interface ParsedStory {
  title?: string;
  summary: string;
  heroRole: string;
  pages: string[];
  /** The writer's plan, kept for review. Never shown to the reader. */
  plan?: string;
}

export type StoryParse = { ok: true; story: ParsedStory } | { ok: false; problems: string[] };

/**
 * Reads the story pass's plain-text format. Tolerant of the markdown dressing
 * models add ("**PAGE 1**", "## Page 1:"), strict about the things the rest of
 * the pipeline depends on: page count, sequence, and no empty or runaway page.
 */
export function parseStory(raw: string, { first }: { first: boolean }): StoryParse {
  // Gemini occasionally emits U+FFFD where a curly apostrophe belongs
  // ("Grampa�s"). Between letters it can only have been an apostrophe.
  const text = raw.replace(/\r\n/g, '\n').replace(/(?<=\p{L})�(?=\p{L})/gu, '’');
  const field = (name: string) =>
    new RegExp(`^[\\s*_#>]*${name}[\\s*_]*:[\\s*_]*(.+?)[\\s*_]*$`, 'im').exec(text)?.[1]?.trim();

  const problems: string[] = [];
  const header = /^[\s*_#>]*page\s+(\d+)[\s*_:.\-—]*$/gim;
  const marks = [...text.matchAll(header)];

  const pages: string[] = [];
  marks.forEach((mark, i) => {
    const start = (mark.index ?? 0) + mark[0].length;
    const end = i + 1 < marks.length ? marks[i + 1].index : text.length;
    pages.push(
      text
        .slice(start, end)
        // Markdown emphasis ("*Clink.*", and "*Ping. Ping." left unclosed) would
        // reach the reader as literal asterisks.
        .replace(/\*+/g, '')
        .replace(/^[\s_]+|[\s_]+$/g, '')
        .replace(/\s*\n\s*/g, ' ')
        .trim(),
    );
  });

  if (marks.length < PAGES.min || marks.length > PAGES.max) {
    problems.push(
      marks.length === 0
        ? `No pages found. Each page must start with a line reading exactly "PAGE 1", "PAGE 2" and so on.`
        : `The story has ${marks.length} pages; it must have ${PAGES.min}–${PAGES.max}.`,
    );
  }
  const numbers = marks.map((m) => Number(m[1]));
  if (numbers.some((n, i) => n !== i + 1)) {
    problems.push(`Pages must be numbered 1, 2, 3… in order; got ${numbers.join(', ')}.`);
  }
  pages.forEach((page, i) => {
    const words = wordCount(page);
    if (words < PAGE_WORDS.min) problems.push(`Page ${i + 1} is ${words === 0 ? 'empty' : `only ${words} words`}.`);
    if (words > PAGE_WORDS.max) problems.push(`Page ${i + 1} is ${words} words; keep every page under ${PAGE_WORDS.max}.`);
  });

  const summary = field('SUMMARY');
  const heroRole = field('HERO');
  if (!summary) problems.push('The SUMMARY line is missing.');
  if (!heroRole) problems.push('The HERO line is missing.');

  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    story: {
      title: first ? field('TITLE') : undefined,
      summary: summary!,
      heroRole: heroRole!,
      pages,
      plan: extractPlan(text),
    },
  };
}

/**
 * The PLAN block the brief asks for before the story: everything from the PLAN
 * heading to the first TITLE, SUMMARY or HERO line. Optional — a story without
 * one is still a story — and only ever read by whoever reviews the export.
 */
function extractPlan(text: string): string | undefined {
  const start = /^[\s*_#>]*plan[\s*_:]*$/im.exec(text);
  if (!start) return undefined;
  const rest = text.slice(start.index + start[0].length);
  const end = /^[\s*_#>]*(?:title|summary|hero)[\s*_]*:/im.exec(rest);
  const plan = (end ? rest.slice(0, end.index) : '')
    .split('\n')
    .map((line) => line.replace(/^[\s*_#>-]+|[\s*_]+$/g, ''))
    .filter(Boolean)
    .join('\n');
  return plan || undefined;
}

// ── Step 2: the plates and the world record ───────────────────────────────

export interface PlatesPromptInput extends ChapterPromptInput {
  story: ParsedStory;
  /** Violations from the previous attempt, appended verbatim for the one retry. */
  violations?: string[];
}

export function buildPlatesPrompt(input: PlatesPromptInput): string {
  const { rule, chapterNumber, styleBible, worldCanon, chapterDigests, story, violations } = input;
  const storyMode = (input.mode ?? 'rule') === 'story';
  const first = chapterNumber === 1;
  const n = story.pages.length;
  const sections: string[] = [];

  sections.push(`You are the art director and archivist for a picture book. The story is written and
final — you do not change a word of it. Your job: decide how the pictures look, describe
the picture for every page, and keep the record of how this world works. Return JSON.

Baseline: "${BASELINE}" — the present-day world, except for its rules.
${storyMode ? 'The story began from' : 'The rule'}: ${rule}
Chapter: ${chapterNumber}

THE STORY — ${n} pages, following ${story.heroRole}:

${story.pages.map((page, i) => `PAGE ${i + 1}: ${page}`).join('\n\n')}${
    story.plan ? `\n\nThe writer's plan, for understanding the story — not to be drawn:\n${story.plan}` : ''
  }`);

  if (!first && worldCanon) {
    sections.push(`This world already exists. Its canon before this chapter:

${JSON.stringify(worldCanon, null, 1)}

Previous chapters:
${(chapterDigests ?? []).map((d) => `  ch${d.chapter} (${d.ruleType}): ${d.rule} — ${d.keyOutcome}`).join('\n')}

The frozen styleBible, which you must NOT restate or change:
${styleBible}`);
  }

  sections.push(`Work through the fields in order — it is the order they appear in the JSON.

1. ruleType.${
    first
      ? ' This is chapter 1: "additive". transitionNote is an empty string.'
      : ` "additive", or "contradictory" if the new rule reverses or overrides one already in
   activeRules. If unsure, "ambiguous" — treated as contradictory, because an explicit
   change beats a silent paper-over. If contradictory, move exactly one rule from
   activeRules into supersededRules with chapterReversed = ${chapterNumber}, and write a
   transitionNote of at most ${TRANSITION_NOTE_MAX_WORDS} words about the changeover. If additive,
   leave supersededRules exactly as it is and transitionNote empty.`
  }`);

  if (first) {
    sections.push(`2. styleBible — ONE string, AT MOST ${PROMPT_LIMITS.styleBible} CHARACTERS. How every picture in this world is
   DRAWN, forever: a 2D cartoon picture-book style — medium and line, a palette of four to
   six named colours, the light, and simple, rounded figures on uncluttered backgrounds.
   Simple shapes are what the illustrator draws cleanly; detail is where it goes wrong. Do NOT describe buildings, streets,
   vehicles or technology: the scenes do that, and a styleBible full of architecture puts
   the same buildings in every picture. Describe what is, never what is not.`);
  }

  sections.push(`${first ? '3' : '2'}. worldCanon — a COMPLETE record that ${first ? 'starts this world' : 'replaces the one above: carry forward what still holds, revise what the new rule changes'}.
   - baseline: exactly "${BASELINE}"
   - activeRules: at most ${CANON_CAPS.activeRules}, each with the chapter it entered.${
     storyMode ? ' For a story, what it has established about this world — often one entry or none.' : ''
   }
   - visualLaws: at most ${CANON_CAPS.visualLaws}, each at most ${PROMPT_LIMITS.visualLaw} characters. What is ALWAYS
     true on screen in this world. They are added to every image prompt. The illustrator
     has not read the story — where its prompt is silent it draws today's world.
       State what IS PRESENT. Never what is missing: the illustrator cannot process "no",
       "not" or "without", and naming a thing to forbid it makes it MORE likely to appear.
         rule "a world without men"
           WRONG: "no men anywhere"      RIGHT: "every person is a woman or a girl, all ages"
         rule "humans live only 10 years"
           RIGHT: "every person pictured is a child, aged one to ten"
         rule "gravity is half as strong"
           RIGHT: "hair, cloth and dust drift and hang in every scene"
       REQUIRED whenever the rules change who appears or how people look — their age,
       sex, size, number, body. Without a law the illustrator draws today's people: the
       story's nine-year-old grandfather came out as an old man with wrinkled hands.
       Otherwise, only what the rules change about appearances. An ordinary present-day
       story usually has none — return an empty array, do not invent decoration.
       Every law is added to EVERY picture — a girl alone in her bedroom included — so it
       must be true of every picture. "households are large groups of women" is not: it
       puts a crowd in every room. A fact about how society works belongs in invariants.
   - neverDrawn: if the rules remove something visible from the world — a kind of person,
     animal or thing — the lowercase words that would summon it: singular, plural, common
     synonyms and pronouns. "a world without men" → ["man", "men", "boy", "boys", "male",
     "father", "husband", "gentleman", "he", "him", "his", "beard"]. These words are NEVER
     sent to the illustrator; they are checked, so that no image prompt contains them.
     Empty when the rules remove nothing visible. At most ${CANON_CAPS.neverDrawn}.
   - physicsDeltas: at most ${CANON_CAPS.physicsDeltas}. invariants: at most ${CANON_CAPS.invariants} — facts later chapters must
     never contradict.
   - namedEntities: at most ${CANON_CAPS.namedEntities}. The people, places and objects that RECUR IN THIS STORY${first ? '' : ', plus earlier ones worth keeping'} —
     the little sister, the tower, the boat, the kitchen. visualDescription at most ${PROMPT_LIMITS.entityDescription} characters,
     concrete enough to draw the same way twice. It must agree with visualLaws and use no
     neverDrawn word.
       EVERY character other than the hero who is in two or more pictures is a namedEntity
       of type "person" — otherwise the illustrator dresses them differently on every
       page. Their visualDescription works like the hero's look: START with their age ("a
       girl of six"), then build, hair, clothes with colours, one thing they carry. Never a
       face. Choose colours that differ from the hero's, so the two never blur together.
   - liveTensions: at most ${CANON_CAPS.liveTensions} — what is still unresolved, for a later chapter to pick up.
   - supersededRules: at most ${CANON_CAPS.supersededRules}.`);

  sections.push(`${first ? '4' : '3'}. hero — who the story follows.
   - role: how the story refers to them ("Nell", "the lighthouse keeper", "the three sisters").
   - look: at most ${PROMPT_LIMITS.heroLook} characters, added to every picture they are in, so they are drawn
     the same way each time. START with their age, in words the illustrator can draw —
     "a girl of twelve", "a woman of about seventy" (the story's HERO line gives it:
     ${story.heroRole}). Then build, hair, clothes with their colours, one thing they carry.
     Take it from the story where the story says. Never a face. It must agree with
     visualLaws and use no neverDrawn word.
   - want: at most 15 words — what they are after.`);

  sections.push(`${first ? '5' : '4'}. chain — the reasoning behind this world, for the "how this world works" diagram.
${
    storyMode
      ? `   Twelve beats of the story, in the order they happen: what happens, and what that causes.`
      : `   Twelve consequences of the rule — including ones the story only glances at, and second-
   and third-order effects a thoughtful person would not have guessed. Precise, technical
   words are fine here; this is analysis, not the book.`
  }
   - ids "e1" to "e12" IN ORDER: e1–e4 order 1, e5–e8 order 2, e9–e12 order 3. Exactly
     ${EFFECTS_PER_ORDER} of each order. Each text at most ${EFFECT_MAX_WORDS} words, tagged with the one domain it touches.
   - derivedFrom: order-1 entries reference {"kind":"rule"}. Every order-2 entry references
     at least one order-1 id, and every order-3 entry at least one order-2 id — check e9,
     e10, e11 and e12 individually before you finish. An order-3 entry pointing straight at
     the rule, or at another order-3 entry, is misfiled and the chapter is rejected.${
       first
         ? ''
         : `
   - At least one entry must ALSO reference the existing world — {"kind":"invariant","index":N}
     or {"kind":"liveTension","index":N} into the canon above. That is in addition to its
     parent reference, never instead of it: [{"kind":"effect","id":"e6"},{"kind":"liveTension","index":2}].`
     }`);

  sections.push(`${first ? '6' : '5'}. arc — ${ARC_MOVEMENTS.min} to ${ARC_MOVEMENTS.max} movements of the story as written, labelled in plain words
   for what happens in them (at most ${MOVEMENT_LABEL_TARGET_WORDS} words). Contiguous, in order, covering pages 1–${n}
   exactly, no gaps or overlaps. Lengths may differ.`);

  sections.push(`${first ? '7' : '6'}. pages — exactly ${n}, index 1 to ${n}, one for each page of the story, in order.
   - derivedFrom: the chain id this page shows most. A citation, not a running order.
   - shotType: whatever serves the moment — medium for people doing something, wide for
     arrivals and endings, interior for rooms. close-up and detail are ONLY for an object
     on its own with nobody in the frame (a letter on a table) — any picture with a person
     in it is medium or wider, and is changed to medium automatically if not. At least
     ${MIN_DISTINCT_SHOT_TYPES} different across the book.
   - heroInScene: true when the hero is in this picture. They should be in at least half.
   - entityRefs: at most ${PROMPT_LIMITS.entityRefsPerPage} names from namedEntities — every recurring person in this
     picture, then the place or thing it is at. Their descriptions are added
     automatically. The hero is never listed here; heroInScene covers them.
   - imagePrompt: ${SCENE_CHARS_TARGET}–${PROMPT_LIMITS.imagePrompt} characters. The picture for THIS page's text: the moment it
     describes, not a general view of the place.
       a. Start with who is in the frame and what they are doing. If the hero is in it,
          call them by a short plain noun ("the girl", "the old fisherman") — their look
          is added automatically, so do not describe it again. The same for a recurring
          person in entityRefs ("her little sister"): name them, never re-dress them.
       b. Then where, the time of day, the weather and light the text implies, and two or
          three concrete details from the text.
       c. Name every person concretely — "a girl", "two old women", "a baby in a pram".
          Everyone in the picture must agree with the visual laws — describe them as the
          laws say they look, not as the story's words might suggest today ("Grampa" in a
          world where nobody passes ten is "a boy of nine", never "an old man"). Where the rules change
          WHO exists, never leave anyone vague: "people", "a crowd", "workers" and
          "children" are drawn from today's world. Say "a crowd of women", "girls".
       d. Never use a neverDrawn word, not even to say it is absent. "A street without
          men" draws men.
       e. No writing in the picture — no signs, labels, newspapers, letters to read. The
          illustrator turns them into gibberish.
       f. No style words ("illustration", "cartoon", "watercolour", "in the style of").
          Style is added separately.
       g. Stay in the story's places. Show a road, a bridge, a factory or an office only
          if this page's text is there.
       h. Keep it simple enough to draw cleanly. The illustrator tangles limbs and melts
          objects when a picture is crowded or fiddly. One or two figures, three at most,
          in clear, simple poses, whole bodies, a little apart from each other. No hands
          doing detailed work, no close-ups of hands at all. Machines with many thin parts —
          bicycles, chains, gears, engines — are shown whole and from a few steps back,
          never in close-up. One main thing happening, against a simple background.
   - altText: one sentence describing the picture for a screen reader.`);

  sections.push(`${first ? '8' : '7'}. diagramHints — palette: 3 to 5 hex colours ${first ? 'from your styleBible' : 'from the styleBible'}; motif: at most 8 words naming
   a decorative motif for the reasoning diagram.`);

  if (violations?.length) {
    sections.push(`Your previous attempt was rejected. Fix every one of these and change nothing else:

${violations.map((v) => `  - ${v}`).join('\n')}`);
  }

  return sections.join('\n\n');
}
