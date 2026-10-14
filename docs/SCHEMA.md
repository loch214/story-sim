# Data Contract

Every type here is enforced by a Zod validator. A chapter is written in **two
Gemini calls**: a story, in plain prose, then the plates and world record, as
JSON. Each step gets one retry carrying what was wrong, then fails visibly.

## Pre-flight classifier

One cheap Gemini call, thinking off, before any chapter call fires.

```ts
interface PreflightResult {
  mode: 'rule' | 'story';
  verdict: 'valid' | 'coercible' | 'unusable';
  interpretedRule: string;   // '' when unusable
  reason: string;            // ≤20 words, shown on unusable
}
```

- `valid` — usable as written; `interpretedRule` ≈ input.
- `coercible` — "a story about dragons" → "dragons exist and are a normal part
  of present-day ecology". Restated, shown, confirmed by the user.
- `unusable` — empty, gibberish, or a style request ("make it funny", "in the
  style of Ghibli"). Rejected with a nudge and two example rules.

`mode` is decided **first** — the schema's `propertyOrdering` puts it ahead of
the verdict, because without it the API writes fields alphabetically and the
model wrote `interpretedRule` before deciding what kind of input it had.

`interpretedRule` is what enters `worldCanon.activeRules` and renders on page 0.
The raw input is never stored as the rule.

## Chapter generation — two steps

```
POST /api/chapter
  ├─ step 1  buildStoryPrompt  → generateText  → parseStory      (prose)
  └─ step 2  buildPlatesPrompt → generateJson  → platesResponseSchema
             merge story text onto plates → normalise → validate
```

**Why two.** The single-call design asked for a twelve-node causal chain first
and pages citing it second, under two dozen counted constraints, inside a JSON
field. However the voice section was phrased, the skeleton was a list of
effects and the book read like one: no plot, a new place every page, a road
then a factory then a bridge. Writing is now done first, on its own, with
nothing to satisfy but a page count and a format. Everything a machine needs is
derived from the finished story afterwards, and step 2 never returns page text
— so its retry can never damage the prose.

### Input

Bounded permanently. Prior prose never enters the prompt.

```ts
interface ChapterRequest {
  rule: string;                      // the confirmed interpretedRule
  mode: 'rule' | 'story';            // default 'rule'
  chapterNumber: number;
  styleBible?: string;               // absent for chapter 1, verbatim thereafter
  worldCanon?: WorldCanon;           // absent for chapter 1
  chapterDigests?: ChapterDigest[];  // absent for chapter 1
}

interface ChapterDigest {
  chapter: number;
  rule: string;
  ruleType: RuleType;
  keyOutcome: string;   // the story pass's SUMMARY, ≤40 words
}
```

`chapterDigests` caps at 6, oldest dropped. `worldCanon` plus digests is the
entire memory of the world, so context is flat forever.

### Step 1 — the story

Plain text, no `responseSchema`. The prompt asks for a story, not a world:
somebody to follow (a name is allowed), something they want, something in the
way, pages joined by *but* and *so* rather than *and then*, a turn past the
middle, and an ending that answers the opening. In `rule` mode the change is the
setting, and the reader learns how the world works only by watching the hero
deal with it — two or three consequences that matter to the plot, not a survey.
The trouble must come *from* the change: a lost-letter-in-a-snowstorm story set
in "a world without men" read well and never used the rule after page 1. And
every question the story raises gets answered — the same book posted its letter
to a house "nobody has lived in for years" and ended there.

The writer plans before it writes. A `PLAN` block — trouble, want, what is in
the way, the turn, the ending, and every open question with the page that
answers it — comes first. The reader never sees it; step 2 is given it to
understand the story, and it is stored and exported (`plan`) so a chapter whose
rule never mattered can be traced to a plan that never used it.

```
PLAN
TROUBLE: <what goes wrong only because of the change>
WANT: … IN THE WAY: … TURN: … ENDING: … QUESTIONS: …

TITLE: <chapter 1 only, ≤6 words>
SUMMARY: <one sentence of what happened>
HERO: <who the story follows, and their age — "June, a girl of twelve">
PAGE 1
<text>
PAGE 2
<text>
…
```

`parseStory` tolerates markdown dressing (`**PAGE 1**`, `## Page 1:`) and
enforces only:

- **12–15 pages**, numbered 1…N in order. The writer chooses N — a hard twelve
  made endings arrive mid-scene.
- every page **5–90 words** — wide on purpose; a page can turn on four words.
- `SUMMARY` and `HERO` present.

Failures go back to the writer as plain sentences for its one retry.

### Step 2 — plates and world record

JSON, against `platesSchemaFor(chapterNumber)`. The model is given the story
verbatim and told it is final.

```ts
interface PlatesResponse {
  ruleType: RuleType;          // model's raw classification
  transitionNote?: string;     // ≤40 words, required when contradictory
  styleBible?: string;         // chapter 1 only — absent from the schema thereafter
  worldCanon: WorldCanon;      // complete replacement
  hero: Hero;
  chain: Effect[];
  arc: Movement[];
  pages: PlateSpec[];          // Page minus `text`
  diagramHints: DiagramHints;
}
```

**Field order is the order the model thinks in**, and it is set with
`propertyOrdering` on every object. Without it the API orders properties
alphabetically — the old schema had the model write `pages` before
`styleBible`, `throughLine` and `worldCanon`, so every image prompt was written
before the visual laws it had to obey existed. Now: what kind of change → how
pictures look → what is always on screen → who the hero is → the reasoning →
the shape → the plates.

### The merged chapter

The route joins step 1's text onto step 2's plates by index. This is what the
client receives, validates, and persists:

```ts
interface ChapterResponse {
  ruleType: RuleType;
  transitionNote?: string;
  worldTitle?: string;         // chapter 1 — from TITLE
  styleBible?: string;         // chapter 1
  summary?: string;            // from SUMMARY; becomes the digest
  plan?: string;               // from PLAN; review only
  diagramHints: DiagramHints;
  hero: Hero;
  throughLine?: ThroughLine;   // legacy, pre-rework chapters only
  arc: Movement[];
  chain: Effect[];
  pages: Page[];
  worldCanon: WorldCanon;
}

type RuleType = 'additive' | 'contradictory' | 'ambiguous';
```

The model reports its raw classification; **the app** coerces `ambiguous →
contradictory`. Keeping the policy in code and the honest answer in the output
means the hedge rate is observable.

`worldTitle` names the book, not the rule — "The Long Fall", not "Gravity Is
Half As Strong". It is frozen alongside the styleBible. Empty, it falls back to
a truncated `interpretedRule`.

```ts
interface DiagramHints {
  palette: string[];   // 3–5 hex colours, drawn from the styleBible
  motif: string;       // ≤8 words
}
```

Hints only. The app computes every coordinate — an LLM cannot measure text.

## Hero

```ts
interface Hero {
  role: string;   // how the text refers to them — "Nell", "the lighthouse keeper"
  look: string;   // ≤140 chars: age, build, hair, clothes and colours, one thing carried
  want: string;   // ≤15 words
}
```

The reader follows somebody, so the pictures have to show the same somebody.
`look` is spliced verbatim into every plate whose `heroInScene` is true — the
same mechanism that makes a named tower the same tower. It describes clothes and
silhouette, **never a face**: independent generations cannot hold a face, but
they hold a rust-red smock and a coil of rope well enough for a picture book.

Names are allowed in page text. The old rule against them came from the
illustrator, and the illustrator is now given a costume rather than a name.

## The chain

```ts
type Domain = 'society' | 'technology' | 'economy' | 'politics'
            | 'culture' | 'environment' | 'conflict' | 'science';

type Ref =
  | { kind: 'rule' }
  | { kind: 'effect';      id: string }
  | { kind: 'invariant';   index: number }    // into prior worldCanon
  | { kind: 'liveTension'; index: number };   // into prior worldCanon

interface Effect {
  id: string;            // 'e1' … 'e12'
  order: 1 | 2 | 3;
  domain: Domain;
  text: string;          // ≤25 words
  derivedFrom: Ref[];
}
```

Four per order. The chain is now the **analysis behind the story**, written in
step 2 after the story exists — it feeds the "how this world works" diagram and
the chapter 2+ brief, and is no longer the skeleton the pages hang on. In
`story` mode it is twelve beats; in `rule` mode twelve consequences, including
ones the story only glances at.

`derivedFrom` is what makes the chapter 2+ brief enforceable: a chapter whose
chain contains no `invariant` or `liveTension` reference never touched the
existing world, and is rejected.

## Pages

```ts
type ShotType = 'wide' | 'medium' | 'close-up' | 'detail' | 'interior'
              | 'aerial' | 'crowd' | 'incidental-figures' | 'diagram';

interface Page {
  index: number;          // 1–N, N = 12–15
  text: string;           // from the story pass, verbatim
  derivedFrom: string;    // Effect id — a citation, not a running order
  shotType: ShotType;
  heroInScene?: boolean;  // absent on pre-rework chapters
  imagePrompt: string;    // asked 150–400 chars (rejected under 80), scene only
  entityRefs: string[];   // ≤2 names from worldCanon.namedEntities: recurring people, then the place
  altText: string;
}
```

`medium` and `close-up` were added with the rework; the old list only had words
for surveying a place. `close-up` and `detail` are for an object alone —
normalisation turns any tight shot with a person in it into `medium`. The old values remain so stored chapters still parse.

`imagePrompt` is the picture for **this page's text** — the moment it describes,
not a general view of the place. It opens with who is in the frame and what they
are doing, refers to the hero by a short noun ("the girl") because their `look`
is added automatically, names every person concretely, asks for no lettering
(Flux renders it as gibberish), and carries no style words.

**`imagePrompt` frames a situation, not a body.** Flux refuses on subject
matter, and it refuses in bulk: the rule *humans live only 10 years* lost 10 of
12 plates, plate 1 to the phrase "four-year-old biological adult". A page about
an unusual age, an injury or a death must be carried by what is happening around
it, never by describing anatomy. **Not yet enforced.**

## worldCanon

Bounded, replacement semantics. Each chapter returns a complete new canon that
supersedes the previous one entirely.

```ts
interface WorldCanon {
  baseline: 'present-day Earth, except:';
  activeRules:     { rule: string; enteredChapter: number }[];   // ≤6
  visualLaws:      string[];                                     // ≤3, ≤70 chars
  neverDrawn:      string[];                                     // ≤30, default []
  physicsDeltas:   string[];                                     // ≤6
  invariants:      string[];                                     // ≤8
  namedEntities:   NamedEntity[];                                // ≤10
  liveTensions:    string[];                                     // ≤5
  supersededRules: { rule: string; chapterReversed: number }[];  // ≤4
}

interface NamedEntity {
  name: string;
  type: 'person' | 'place' | 'object' | 'institution';
  visualDescription: string;   // asked ≤110, rejected over 140; a person's states their age
}
```

**`person` entities** are the recurring characters other than the hero — the
little sister on eight pages. Held by costume like the hero, spliced in right
after the hero's look. Without them the sister was dressed afresh on every
page: yellow sweater, yellow cap, then a red scarf and green coat.

**`namedEntities`** are now the people, places and objects that recur **in the story**,
picked out of it in step 2. `visualDescription` is spliced verbatim, so chapter
3's tower is chapter 1's tower.

**`liveTensions`** is what stops later chapters drifting into disconnection.

### Visual laws and `neverDrawn`

Flux is given the assembled prompt and nothing else: not the rule, not the
story. Where the prompt is silent it draws the present-day world. Two fields
carry the rule across, and they work in opposite directions:

- **`visualLaws`** say, positively, what is always on screen — "every person is
  a woman or a girl, all ages". They are spliced into every plate. **Never
  phrased as an absence**: there is no negative-prompt parameter, so "no men"
  merely puts *men* in front of the model. Rule 14 rejects negations.
- **`neverDrawn`** lists the words that would summon what the rules removed —
  for a world without men: `man, men, boy, boys, male, father, husband, he, him,
  his…`. It is **never sent to the illustrator**. It exists so the validator can
  prove no field that does reach Flux contains one (rule 23). A single "his" in
  one scene was enough to put a man on that plate.

Where `neverDrawn` contains a word for a kind of person, the rule has changed
*who exists*, and rule 24 also rejects vague people words — "commuters",
"workers", "a crowd" — unless the same prompt says who they are. Flux fills a
vague word from today's world.

Both live in `worldCanon`, not with the frozen styleBible, so a later rule can
put back what an earlier one took off the page.

**`priorCanon` is provenance, not accumulation.** A chapter's chain holds
`invariant` and `liveTension` references by *index* into the canon that existed
when it was generated, so the chapter keeps a snapshot of it.

## The image endpoint

Verified against `@cf/black-forest-labs/flux-1-schnell` with live calls in
Spike 0. The entire input surface is:

| Param | Constraint |
|---|---|
| `prompt` | 1–**2048 characters** |
| `steps` | default 4, max 8 — we send **4** |
| ~~`seed`~~ | **removed from the schema — sending it is a 400** |

`seed` was accepted in Spike 0 and is not accepted now. Any request carrying it
returns `400` code `5006`. See PLAN.md § Known issues — this cost ten plates
before it was identified.

There is **no width or height parameter**. Output is **1024×1024 JPEG**, base64
in `result.image`. Pages are therefore 1:1, and the text band sits over the
lower third — the region the composition clause reserves.

Errors carry a numeric `code`, which is the hook the failure taxonomy branches
on. Measured latency is 1.7–4.5s per plate.

**Cost is reported, not estimated.** Every response carries a `cf-ai-neurons`
header: **172.80** for one plate at 4 steps. A 15-page chapter is 2,592 neurons.

## Structured output constraints

Verified against `gemini-3.6-flash`:

- **`minItems` and `maxItems` are rejected** with a bare 400. Every cap is
  prompt-instructed *and* validator-enforced.
- **`anyOf` works**, including nested inside array items.
- **`propertyOrdering` is accepted, and needed.** Without it properties come
  back alphabetically. `check:fixture` fails if any object in any schema lacks
  it, or if it differs from declaration order.

## Image prompt assembly

Assembled by the app in `lib/prompt.ts`, never returned whole by the model.

**What Flux actually reads.** Cloudflare accepts 2048 characters, but the
reference FLUX.1 [schnell] pipeline encodes at most **256 T5 tokens** — about
1,000–1,100 characters of English — and silently drops the rest. Cloudflare's
docs do not say whether they raise that limit; we assume they do not. The old
assembly ran to ~1,700 characters with the visual laws ~1,300 in, which is the
most likely reason "a world without men" kept drawing men: the law that said
otherwise was in the part that got cut. **Order is priority:**

```
{imagePrompt}                       what happens on this page
| {hero.look}                       when heroInScene — binds to "the girl" just before it
| {person visualDescriptions}       recurring people on this page
| {visualLaws, joined '; '}         what is always on screen
| {place/object visualDescription}  the named place or thing
| {shotType} shot
| {styleBible}
| main subject in the upper two-thirds, quiet lower third
```

If anything is clipped, it is a few words of style — never the scene, the hero,
a recurring person or a law.

| Part | Cap |
|---|---|
| `imagePrompt` | 400 (asked ≥150, floor 80) |
| `hero.look` | 140 |
| visual laws | 3 × 70 asked, 90 hard |
| entity descriptions | 2 × 110 asked, 140 hard |
| shot type | ≤29 |
| `styleBible` | 240 new worlds · 320 legacy |
| composition clause | 55 |
| **worst case** (hard caps) | **1419** new · **1499** legacy |
| **typical** | **<1000** |

`PROMPT_LIMITS.assembled` is 1500. Over it, assembly drops places and objects,
then people, then trims the scene at a word boundary; the caps are set so neither normally
happens. The styleBible, laws and hero look are never trimmed — each exists to
be identical on every plate.

The **styleBible describes how pictures are drawn, not what is in them.** The
step 2 prompt forbids architecture, streets, vehicles and technology in it: a
styleBible describing "impossibly tall architecture" put the same buildings in
every plate, which is part of why every book looked like roads and bridges.

## Seeds

```
seed = fnv1a(`${worldId}:${chapterNumber}:${pageIndex}`) >>> 0
```

Derived and stored — but **not sent**, because the model no longer accepts it.
A retry redraws the same prompt as a different image.

## Normalisation

Applied before validation, silently, without rejecting the chapter.

**Bookkeeping is repaired, not sent back** (`lib/repair.ts`). A finished book
was thrown away twice over chain entry e9 citing e4 — a wrong arrow in a
diagram the reader rarely opens. Faults with one unambiguous fix are put right
and listed in the route's log: chain links (rules 5, 6), page citations (3),
entity references (9), canon caps (10), overlong chain text, descriptions,
hero look and scenes (13), a chapter 2+ styleBible or title (11), and arc
tiling and labels (15). Anything that changes what the reader reads or sees —
rules 14 (absence), 23, 24, 25, 26, a thin scene — still goes back to the
model. The validator keeps every rule as a backstop.

**A recurring person is drawn only where the scene shows them.** Their
description is attached when the page text names them and the scene shows
somebody besides the hero, and removed — even if the model listed it — when the
scene shows the hero alone. "Mia was gone" over "the boy stands alone on a
hill" would otherwise have drawn Mia there.

- **Banned style vocabulary is stripped from `imagePrompt`**: `photorealistic`,
  `photo`, `3D render`, `octane`, `oil painting`, `anime`, `in the style of`.
- **`worldTitle` empty on chapter 1** falls back to a truncated
  `interpretedRule`.
- **A `close-up` or `detail` shot with anybody in it becomes `medium`.** Flux
  mangles hands, and a tight shot of someone doing something makes the hands the
  picture. The scene rarely says "hand" ("the girl pushes the envelope into the
  slot"), so any person counts.
- **A recurring person named in a page's text is attached to its picture**
  (`entityRefs`, people ahead of the place) when the picture has anyone in it.
  "Are you Mara?" was drawn as a stranger in a bun because the model left her
  reference off. Proper names only — "her mother's name" put the wrong mother
  in a picture, so role words never attach.

## Validation

Applied to every merged, normalised `ChapterResponse` before persistence. Every
rule checks **structure or what reaches the illustrator**. None polices prose
style.

1. 12–15 pages, indices 1–N exactly once.
2. Every `page.text` is 5–90 words (already enforced by `parseStory`).
3. Every `page.derivedFrom` resolves to an `Effect.id`.
4. Orders 1, 2 and 3 all present; ≤4 entries per order.
5. Order-1 entries reference `{kind:'rule'}`; order-2 reference ≥1 order-1;
   order-3 reference ≥1 order-2. The message names the eligible parents.
6. **Chapter ≥2:** ≥1 `invariant` or `liveTension` ref in the chain.
8. ≥3 distinct `ShotType` values.
9. `entityRefs` resolve, ≤2 per page.
10. No `worldCanon` array exceeds its cap.
11. **Chapter 1:** `styleBible` present and ≤240 characters.
    **Chapter ≥2:** no `styleBible`, no `worldTitle`.
12. `supersededRules` gains exactly one entry when `ruleType` coerces to
    `contradictory`, with a `transitionNote` ≤40 words; unchanged otherwise.
13. Lengths: `imagePrompt` 80–400 (the prompt asks for ≥150), `visualDescription` ≤140 (asked ≤110), `hero.look` ≤140,
    `Effect.text` ≤25 words.
14. Every `visualLaw` ≤90 characters (asked ≤70) and not phrased as an absence.
15. The arc tiles pages 1–N contiguously, 2–5 movements, label ≤10 words
    (the prompt asks for ≤6 — a 7-word label once failed a whole chapter).
23. No `neverDrawn` word appears in any field that reaches Flux: every
    `imagePrompt`, `hero.look`, entity descriptions, laws, styleBible.
24. Where `neverDrawn` names a kind of person, no `imagePrompt` uses a vague
    people word without also saying who they are.
25. The hero is in at least half the pictures (`heroInScene`).
26. `hero.look` and every `person` entity state an age (`AGE_PATTERN`: a digit,
    an age word, "of nine", "nine-year-old", or a word that fixes the band —
    "woman", "grandmother"; never "girl" or "child" alone). Without one Flux picks an age per
    picture — "a tall slender girl" was a woman on some plates, a teen on others.

### Retired rules

Numbers are not reused, so old exports and violation logs still read.

- **7** — ≥4 domains across the chain. The quota sent every book on a tour:
  a transport page, an economy page, a politics page.
- **16, 17** — pages must not follow the chain one-to-one; entities capped at 5
  pages, ≥3 pages somewhere unnamed. Both forced scattering — a new place every
  page — which is the opposite of a story.
- **18, 21, 22** — the voice rules: sentence-length caps, no semicolons, a
  stiff-word blocklist, no habitual tense, no "The [Name]…" openings. Each fixed
  one symptom of slide-deck prose; together they made the model write to a
  checklist, and none of them could create a plot.
- **19** — scene ≥40% of the assembled prompt. Replaced by a short assembly with
  the scene first and a 150-character floor (rule 13).
- **20** — `throughLine.headNoun` in ≥7 of 12 pages. A word count proved a
  through-line was *mentioned*, not that anything happened to it. Replaced by
  the story pass and `hero`.

## Storage

IndexedDB. Images are stored as Blobs.

```ts
// worlds
{ id, createdAt, title, styleBible, palette, worldCanon, chapterDigests }

// chapters
{ id, worldId, number, rule, mode, ruleType, transitionNote,
  diagramHints, hero, summary, throughLine /* legacy */, arc, chain, pages,
  status, haltedAt, haltMessage, priorCanon }

// images
{ id: `${chapterId}:${pageIndex}`, blob, seed, promptUsed,
  status, neuronCost, failureCode, failureMessage }
```

`status` on chapters: `reasoning | rendering | complete | halted_quota |
halted_error | reasoning_failed`.
`status` on images: `pending | generating | ready | failed | refused`.

`refused` is terminal and per-plate. A prompt-independent fault — a rejected
request shape, or four consecutive refusals with nothing drawn — halts the pool
as `systemic` instead, leaving plates `pending` so a fix can resume them.

### Arc

`arc` is 2–5 movements, each `{ label, fromPage, toPage }`, tiling pages 1–N.
Labelled in step 2 from the story as written. Rule 15 checks the tiling and
nothing about the content. The reader shows the current movement's label beside
the plate number.

### Pre-flight modes

| mode | input | step 1 writes |
|---|---|---|
| `rule` | a general present-tense condition of reality | a story set in a world where it holds |
| `story` | particular characters and events, already begun | that story, continued and finished |

The test is *could this be true of a whole world for years, or did it happen to
someone on a particular day?* When torn, prefer `story`. The two modes share
everything except step 1's opening brief and step 2's description of the chain
(consequences vs. beats). The `story` brief adds an explicit ban on turning
somebody's afternoon into an essay about society.

## Export

v7 export is JSON, images excluded.

```ts
{
  version: 7,
  exportedAt,
  world,                         // the full StoredWorld, canon incl. neverDrawn
  chapters: [{
    id, number, rule, mode, ruleType, transitionNote, status,
    diagramHints, throughLine, hero, summary, plan,
    models,                      // { story, plates } — which Gemini model wrote each
    priorCanon, arc, chain, pages,
    plates: [{ pageIndex, seed, promptUsed, status, neuronCost,
               failureCode, failureMessage }],
  }],
  totals: { plates, drawn, neurons },
}
```

`arc` arrived in v3, `mode` in v4, `throughLine` in v5, `hero` and `summary` in
v6, `models` in v7 (a busy model hands over to a fallback, so a chapter's
writing is judged knowing which model wrote it) — each because the export is the artefact a chapter is reviewed from, and a
field missing from it reads as a feature that never shipped. `promptUsed` is
the fully assembled prompt, which is what makes an export enough to debug a
plate from.
