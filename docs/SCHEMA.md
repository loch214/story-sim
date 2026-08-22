# Data Contract

Every type here is enforced by a Zod validator. Generation output that fails any
rule in [Validation](#validation) is rejected and retried once with the
violation list appended to the prompt, then fails visibly.

## Pre-flight classifier

One cheap Gemini call, thinking off, before any chapter call fires.

```ts
interface PreflightResult {
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

`interpretedRule` is what enters `worldCanon.activeRules` and renders on page 0.
The raw input is never stored as the rule.

## Phase 1 — chapter generation

### Input

Bounded permanently. Prior prose never enters the prompt.

```ts
interface ChapterRequest {
  baseline: 'present-day Earth, except:';   // fixed
  rule: string;                             // the confirmed interpretedRule
  chapterNumber: number;
  styleBible?: string;        // absent for chapter 1, verbatim thereafter
  worldCanon?: WorldCanon;    // absent for chapter 1
  chapterDigests?: ChapterDigest[];  // absent for chapter 1
}

interface ChapterDigest {
  chapter: number;
  rule: string;
  ruleType: RuleType;
  keyOutcome: string;   // ≤30 words
}
```

`chapterDigests` caps at 6, oldest dropped. `worldCanon` plus digests is the
entire memory of the world, so context is flat forever.

### Output

```ts
interface ChapterResponse {
  ruleType: RuleType;              // model's raw classification
  transitionNote?: string;         // ≤40 words, required when contradictory
  worldTitle?: string;             // chapter 1 only — ≤6 words
  styleBible?: string;             // chapter 1 only — omitted from the schema thereafter
  diagramHints: DiagramHints;
  chain: Effect[];
  pages: Page[];
  worldCanon: WorldCanon;          // complete replacement
}

type RuleType = 'additive' | 'contradictory' | 'ambiguous';
```

The model reports its raw classification; **the app** coerces `ambiguous →
contradictory`. Keeping the policy in code and the honest answer in the output
means the hedge rate is observable.

Chapter 2+ requests use a schema variant with no `styleBible` and no
`worldTitle` field at all, so regenerating either is structurally impossible
rather than merely forbidden.

`worldTitle` names the **world**, not the rule — "The Long Fall", not "Gravity
Is Half As Strong". It is frozen alongside the styleBible and labels the world
on the library screen. Empty or absent, it falls back to a truncated
`interpretedRule`.

```ts
interface DiagramHints {
  palette: string[];   // 3–5 hex colours, drawn from the styleBible
  motif: string;       // ≤8 words, e.g. 'hand-inked botanical margins'
}
```

Hints only. The app computes every coordinate — an LLM cannot measure text, so
LLM-authored layout collides and overflows exactly when the diagram gets dense.

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
  id: string;            // 'e1', 'e2', …
  order: 1 | 2 | 3;
  domain: Domain;
  text: string;          // ≤25 words
  derivedFrom: Ref[];
}
```

Max 4 per order, so ≤12 effects. The chain is produced **before** any prose
exists; pages are derived from it. Reversing that order produces a story rather
than a simulation.

`derivedFrom` is what makes the chapter 2+ brief enforceable: a chapter whose
chain contains no `invariant` or `liveTension` reference never touched the
existing world, and is rejected.

## Pages

```ts
type ShotType = 'wide' | 'detail' | 'diagram' | 'interior'
              | 'aerial' | 'crowd' | 'incidental-figures';

interface Page {
  index: number;         // 1–12
  text: string;          // 25–45 words
  derivedFrom: string;   // Effect id
  shotType: ShotType;
  imagePrompt: string;   // scene only
  entityRefs: string[];  // names from worldCanon.namedEntities
  altText: string;
}
```

Always 12 pages, always one image each. `derivedFrom` drives the bidirectional
page 0 ↔ page navigation and makes "derived from the most interesting
consequences" a checkable claim rather than a hope.

`imagePrompt` describes the scene. Style lives in the styleBible; a page that
also specifies style fights it.

**`imagePrompt` frames a situation, not a body.** Flux refuses on subject matter,
and it refuses in bulk: the rule *humans live only 10 years* lost 10 of 12 plates,
plate 1 to the phrase "four-year-old biological adult". A page about an unusual
age, an injury or a death must be carried by what is happening around it — a
school timetable, a court hearing, a retirement at nine — never by describing
anatomy. **Not yet enforced**; it is prompt-instructed and validator-checked work
still open in phase 8.

## worldCanon

Bounded, replacement semantics. Each chapter returns a complete new canon that
supersedes the previous one entirely.

```ts
interface WorldCanon {
  baseline: 'present-day Earth, except:';
  activeRules:     { rule: string; enteredChapter: number }[];        // ≤6
  physicsDeltas:   string[];                                          // ≤6
  invariants:      string[];                                          // ≤8
  namedEntities:   NamedEntity[];                                     // ≤10
  liveTensions:    string[];                                          // ≤5
  supersededRules: { rule: string; chapterReversed: number }[];        // ≤4
}

interface NamedEntity {
  name: string;
  type: 'place' | 'object' | 'institution';
  visualDescription: string;   // ≤30 words
}
```

Two fields are load-bearing:

**`namedEntities[].visualDescription`** is the character-consistency workaround
made concrete. Chapter 3's prompt for the same tower splices in the identical
string written in chapter 1 — the app resolves it, the model does not rewrite
it. Identical text reaching Flux is what makes the tower the same tower.

**`liveTensions`** is what stops later chapters drifting into disconnection. A
new rule should preferentially interact with an existing tension rather than
spawn unrelated consequences.

Caps are enforced twice: the prompt instructs the model to drop the least
important entry, and the validator rejects overflow outright.

## The image endpoint

Verified against `@cf/black-forest-labs/flux-1-schnell` with live calls in
Spike 0. The entire input surface is:

| Param | Constraint |
|---|---|
| `prompt` | 1–**2048 characters** |
| `steps` | default 4, max 8 — we send **4** |
| ~~`seed`~~ | **removed from the schema — sending it is a 400** |

`seed` was accepted in Spike 0 and is not accepted now. Any request carrying it
returns `400` code `5006`, *"Additional or unevaluated properties '/seed' at '/'
not allowed"*. Re-verified live 2026-08-14. See PLAN.md § Known issues — this
cost ten plates before it was identified.

There is **no width or height parameter**. Output is **1024×1024 JPEG**, base64
in `result.image`, about 228 KB decoded. Pages are therefore 1:1, and the text
band sits over the lower third — exactly the region the composition clause
reserves, so the layout needed no adjustment.

```jsonc
// 200
{ "result": { "image": "<base64 jpeg>", "usage": { … } },
  "success": true, "errors": [], "messages": [] }

// 400 — empty prompt
{ "success": false, "result": {},
  "errors": [{ "code": 5006, "message": "AiError: Bad input: …" }] }
```

Errors carry a numeric `code`, which is the hook the failure taxonomy branches
on. Measured latency is 1.7–4.5s per plate, and three concurrent requests — the
real pool width — return 200 with no rate-limit headers.

**Cost is reported, not estimated.** Every response carries a `cf-ai-neurons`
header: **172.80** for one plate at 4 steps. Store that value; do not recompute
it. The rate reconciles as `4.8 × tiles + 9.6 × tiles × steps`, steps billed per
tile.

## Structured output constraints

Verified against `gemini-3.6-flash`:

- **`minItems` and `maxItems` are rejected.** A schema carrying them returns 400
  `INVALID_ARGUMENT` with no field detail; the identical schema passes once they
  are stripped. Array bounds cannot be expressed in `responseSchema`, which is
  why every cap here is prompt-instructed *and* validator-enforced.
- **`anyOf` works**, including nested inside array items — the `Ref`
  discriminated union survives.
- **Truncation is not a live risk.** A full chapter costs ~3,200 output tokens
  plus ~4,700 thinking tokens against a 65,536 ceiling, and returns
  `finishReason: STOP` in about 40s.

## Image prompt assembly

Assembled by the app, never returned whole by the model:

```
{styleBible} | {entity visualDescriptions, joined '; '} | {shotType} shot |
{imagePrompt} |
composition: primary subject in upper two-thirds, lower third uncluttered
```

The composition clause exists because the text band sits over the lower third.
Without it Flux centres the subject and the scrim covers the thing worth seeing.

### Character budget

2048 characters is a hard endpoint limit, so every part is capped and the total
is checked at assembly:

| Part | Cap | Notes |
|---|---|---|
| `styleBible` | 600 | Frozen forever — it must fit forever |
| entity descriptions | 3 × 180 = 540 | `entityRefs` is capped at 3 per page |
| shot type | 24 | Enum, bounded by construction |
| `imagePrompt` | 520 | The per-page scene |
| composition clause | 86 | Fixed string |
| separators | ~12 | |
| **worst case** | **1782** | ~260 characters of headroom |

**Truncation order** when a prompt still exceeds 2048 — deterministic, applied
in this sequence until it fits:

1. Drop entity descriptions from the end of the list backwards.
2. Truncate `imagePrompt` at a word boundary.
3. `styleBible` is never truncated. It is the consistency anchor; a styleBible
   that varies between pages defeats the mechanism it exists to serve. It is
   capped at generation instead, and a chapter whose styleBible exceeds 600
   characters fails validation rather than being trimmed at assembly.

## Seeds

```
seed = fnv1a(`${worldId}:${chapterNumber}:${pageIndex}`) >>> 0
```

Derived, and stored alongside the image — but **no longer sent**, because the
model no longer accepts it. Determinism is therefore gone: a retry redraws the
same prompt as a different image. The derivation is kept because it is stable
across a cleared image store and an export/reimport round trip, and because the
parameter may return.

## Normalisation

Applied before validation, silently, without rejecting the chapter.

- **Banned style vocabulary is stripped from `imagePrompt`** and generation
  continues: `photorealistic`, `photo`, `3D render`, `octane`, `oil painting`,
  `anime`, `in the style of`. Style belongs to the styleBible, so a stray style
  token is a token to remove — not 690 neurons to throw away. Log what was
  stripped; a rising strip rate means the phase-1 prompt needs tightening.
- **`worldTitle` empty or absent on chapter 1** falls back to a truncated
  `interpretedRule`.

## Validation

Applied to every normalised `ChapterResponse` before persistence.

1. `pages.length === 12`, indices 1–12 exactly once.
2. Every `page.text` is 25–45 words.
3. Every `page.derivedFrom` resolves to an existing `Effect.id`.
4. Orders 1, 2 and 3 are all present; ≤4 effects per order.
5. Order-1 effects reference `{kind:'rule'}`; order-2 reference ≥1 order-1
   effect; order-3 reference ≥1 order-2 effect.
6. **Chapter ≥2:** ≥1 `Ref` of kind `invariant` or `liveTension` appears
   somewhere in the chain.
7. ≥4 distinct `Domain` values across the chain.
8. ≥4 distinct `ShotType` values across the 12 pages.
9. Every `entityRefs` entry resolves to a `worldCanon.namedEntities[].name`,
   and no page carries more than **3**.
10. No `worldCanon` array exceeds its cap.
11. **Chapter 1:** `styleBible` is present and ≤600 characters.
    **Chapter ≥2:** no `styleBible` and no `worldTitle` present.
12. `supersededRules` gains exactly one entry when `ruleType` coerces to
    `contradictory`, and is unchanged otherwise; `transitionNote` is present and
    ≤40 words in the contradictory case. Chapter 1 always coerces to
    `additive` — there is nothing yet to contradict.
13. Length caps that keep assembly inside 2048 characters: every `imagePrompt`
    ≤520, every `namedEntities[].visualDescription` ≤180, every `Effect.text`
    ≤25 words.

## Storage

IndexedDB. Images are stored as Blobs — data URLs cost a third more space and
decode slower.

```ts
// worlds
{ id, createdAt, title, styleBible, palette, worldCanon, chapterDigests }

// chapters
{ id, worldId, number, rule, mode, ruleType, transitionNote,
  diagramHints, arc, chain, pages, status,
  haltedAt, haltMessage,   // set on a quota halt, so resume can tell
                           // whether the UTC day has turned
  priorCanon }             // snapshot of the canon this chapter branched
                           // off — see below

// images
{ id: `${chapterId}:${pageIndex}`, blob, seed, promptUsed,
  status, neuronCost,    // the measured cf-ai-neurons header,
                         // never a calculation
  failureCode,           // upstream code, when this plate failed
  failureMessage }
```

`status` on chapters: `reasoning | rendering | complete | halted_quota |
halted_error | reasoning_failed`.
`status` on images: `pending | generating | ready | failed | refused`.

Per-image status is what makes resume-after-halt possible. `refused` is a
distinct terminal state — that page shows a styled placeholder and never retries.

### Arc

`arc` is 2–5 movements, each `{ label, fromPage, toPage }`, tiling pages 1–12
contiguously with no gaps or overlaps. Movement lengths may differ — the
interesting stretch of a premise should get more pages.

The model chooses **how many movements and what they are called**, to fit the
premise it was given: a rule that lasts a day wants *the first hour / everyone at
once / what was still broken by morning*, while a permanent physical change
spreads across generations. Rule 15 checks the tiling and the label length and
**nothing about the content** — a fixed act structure would give every world in
the library the same rhythm, which is the failure this exists to avoid. Labels
naming a template ("act one", "setup") are discouraged in the prompt.

The reader shows the current movement's label beside the plate number.

### Voice — page text only

Rule 18, and it applies to `pages[].text` alone. The **chain is the reasoning
layer and stays precise**; technical vocabulary is correct there and wrong on
the page somebody actually reads.

The target is somebody telling you what happened — plain, direct, concrete. Not
literature, not a news report, not a lecture. Four checkable symptoms of prose
that has drifted away from that:

- **Sentence length ceiling.** No sentence in page text may exceed
  `LONG_SENTENCE_WORDS` (22). One idea per sentence; a comma holding two
  thoughts together is usually two sentences. This is the rule that catches
  "literary" most directly — the fixture ran to 29 words before it existed, and
  the rewrite that brought every page under 22 lost nothing but the drag.
- **No semicolons.** `LITERARY_PUNCTUATION`. Nobody speaks one. Two short
  sentences always do the same work and read faster.
- **Rhythm.** At least 4 of 12 pages must contain a sentence of ≤8 words. Every
  sentence landing at the same medium length is most of why prose reads flat,
  and it is the half a machine can see. Not enforced per page — a clipped closer
  on all twelve would be its own monotony. Both thresholds were calibrated
  against live output rather than guessed: at ≤7 words the rule fired on a
  chapter whose lengths ran 6–18, which would have spent the single retry on a
  near-miss.
- **Register.** `STIFF_REGISTER_PATTERN` flags words that have ordinary
  equivalents, in three families, because the pages went wrong in three
  directions: the technical survey (*subterranean, culvert, deluge, utilise,
  illuminate, carrying capacity*), the politics-and-economics briefing
  (*governance, jurisdiction, populace, sector, moreover, thus*) and the
  literary flourish (*whilst, amidst, myriad, gossamer, poignant*). Deliberately
  not exhaustive: a blocklist cannot teach voice, so it catches repeat offenders
  and the prompt does the teaching, with before/after pairs ("underground
  trains", not "subterranean transit systems").

  The pattern is built from two lists — whole words and stems matched with any
  suffix. It has to be, because the earlier single alternation wrapped every
  entry in `\b…\b`, which silently disabled every stem in it: `illuminat` has no
  word boundary before the `e` of `illuminate`, so the entry that existed to
  catch the prompt's own worked example never matched anything. A list that
  reads as enforcement and enforces nothing is worse than no list.

Beyond what is counted, the prompt bans abstract nouns doing the work — no
"economic pressure", "the authorities", "the system", but the queue outside the
door, the padlock, the price chalked on a board — and asks the page to have a
feeling about itself, funny or sad or startling, because neutral across all
twelve is its own monotony.

### Pages are selected from the chain, not printed off it

Rule 16. The chain is research; the pages are what gets made from it. Left
unconstrained the model emits one page per node **in id order** — the export
showed `derivedFrom` running `e1,e2,…,e12` — and the book reads as twelve
disconnected facts with no selection and no arrangement. That single coupling
was the root cause of the report feel, more than tone or pacing.

So the mapping is deliberately **not** a bijection:

- at least one effect carries 2+ pages, letting a moment unfold — cap 4, so the
  chapter cannot collapse onto one idea;
- some effects therefore get no page at all, which is the editorial judgement
  that was missing;
- page order serves the reading — never effect id;
- `derivedFrom` remains, so derivation stays checkable. It is a citation, not a
  running order.

Rule 17 keeps the world bigger than its landmarks: no named entity on more than
5 of 12 pages, and at least 3 pages somewhere not in `namedEntities` at all.
Eleven of twelve pages once referenced the same three entities, which read as a
book set in one building.

### Prompt budget: the scene must dominate

Every plate in a chapter shares the same styleBible and visual laws, so the
scene is the only thing making one page look different from the next. When the
shared prefix was ~80% of the prompt, every image looked alike. `imagePrompt` is
capped at 650 (was 520) and the prompt asks for 390+; `entityRefsPerPage` is 2
(was 3). Measured on live output, the scene went from ~20% to ~36% of the
assembled prompt.

### Pre-flight modes

`mode` distinguishes what the person typed, and matters more than the verdict:

| mode | input | handling |
|---|---|---|
| `rule` | a general present-tense condition of reality | derive consequences |
| `story` | particular characters and events, already begun | tell it forward |

The test is *could this be true of a whole world for years, or did it happen to
someone on a particular day?* When genuinely torn the classifier prefers `story`
— a premise can always be told as events, but forcing events into a general
condition loses what the person wrote.

The mode travels with the chapter: pre-flight → composer → `POST /api/chapter` →
`buildChapterPrompt` → `validateChapter` → `StoredChapter.mode` → export. It is
optional on the request and defaults to `rule`, so an older client still gets
the derived world it expects.

**What actually differs between the two pipelines**

Both return the same JSON contract, and everything downstream — the reasoning
diagram, prompt assembly, the render pool, the reader — is untouched by the
mode. Only three things change:

- **The chain.** In `rule` mode it is twelve consequences at three orders. In
  `story` mode it is twelve **beats** at three orders: the opening and the hours
  after it, what those lead to over days or weeks, and how it settles. The
  derivedFrom relation is unchanged and means the same thing — *this was caused
  by that* — which is why the diagram still reads.
- **Rule 7.** `MIN_DISTINCT_DOMAINS` is 4 for a derived world and
  `MIN_DISTINCT_DOMAINS_STORY` is 2 for a story. Demanding four domains of a
  story is what turned a boy falling off his bicycle into a chapter with an
  economics beat and a politics beat — the quota conscripted the material.
  Relaxed, not abolished: a story whose every beat lands in one domain is
  happening in a vacuum and is still rejected.
- **Scale.** The story prompt says explicitly that the book is not an essay
  about what such an event would mean for society: no policy, no statistics, no
  institutions reacting. One place, a handful of people, something at stake for
  somebody, settled by beat 12.

The no-named-characters constraint holds in both, because it comes from the
illustrator rather than from taste — twelve independent generations cannot hold
a face. A story follows *the boy*, never Tom.

### Visual laws

`worldCanon.visualLaws` — at most 3, each at most 90 characters — are the only
channel through which a rule reaches the image model. Flux is given the assembled
prompt and nothing else: not the rule, not the chain, not the page text. Where
the prompt says nothing, it draws the ordinary present-day world. That is how
`a world without men` produced plate after plate of men.

Each law states, positively and visually, something always true on screen:

> Every person in every scene is a woman or a girl, spanning all ages.

**Never phrase a law as an absence.** Flux Schnell has no negative-prompt
parameter — the input surface is `prompt` and `steps` — so "no men anywhere"
merely puts *men* in front of the model. `lib/validate.ts` rule 14 rejects
negations outright.

Assembly splices them **once**, immediately after the styleBible where weighting
is heaviest. They were spliced twice while fidelity was unproven; with fidelity
holding, the second copy was spending ~230 characters the scene needed more.
They are never dropped to save characters — they are the mechanism.

They live in `worldCanon`, not with the frozen styleBible, so a later rule can
put back what an earlier one took off the page. Chapter 1's styleBible must agree
with them where it describes figures; the two are read together on every page.

**The failure reason is stored on the plate.** `failureCode` and
`failureMessage` carry Cloudflare's `code` and `message` through the route and
the pool onto the image record, and into the export. A chapter that comes back
mostly withheld is diagnosable from the export alone — which it was not when ten
plates were lost to a cause the status field could not express.

A refusal is only ever *per subject*. A prompt-independent fault — a rejected
request shape, or four consecutive refusals with nothing drawn — halts the pool
as `systemic` instead, leaving the plates `pending` so a fix can resume them.
Never let an unrecognised upstream error land in `refused`: that is precisely
how one bug came to look like twelve.

**`priorCanon` is provenance, not accumulation.** The world's canon is replaced
every chapter, but a chapter's chain holds `invariant` and `liveTension`
references by *index* into the canon that existed when it was generated. Without
a snapshot, chapter 2's reasoning diagram becomes unreadable the moment chapter 3
replaces the canon. It is bounded by the same caps as any canon.

## Export

v4 export is JSON, images excluded, so a world stays small enough to paste.

```ts
{
  version: 4,
  exportedAt,                    // ISO string
  world,                         // the full StoredWorld
  chapters: [{
    id, number, rule, mode, ruleType, transitionNote, status,
    diagramHints, priorCanon, arc, chain, pages,
    plates: [{ pageIndex, seed, promptUsed, status, neuronCost,
               failureCode, failureMessage }],
  }],
  totals: { plates, drawn, neurons },
}
```

`arc` arrived in v3 and `mode` in v4, both for the same reason: the export is
the artefact a chapter is reviewed from, and reviewing page text without knowing
whether it was derived from a rule or told forward from a story means reviewing
it against the wrong brief. Older files omit both — chapters written before the
fields existed all had an implicit `mode` of `rule`.

A reimported world regenerates from the same prompts but not the same images —
see § Seeds. `failureCode` and `failureMessage` are what make a bad run
diagnosable from the file alone. `promptUsed` is the fully assembled
prompt — styleBible, spliced entity descriptions, shot type, scene and
composition clause — which is what makes an export enough to debug from.
