# Build Plan

## Spike 0 — verify before anything is frozen

Each of these invalidates a downstream decision if it comes back differently
than assumed. Run them first, record the answers in this file, then build.

| # | Question | Blocks |
|---|---|---|
| S0.1 | Flux Schnell on Workers AI: accepted dimensions, max steps, response shape, observed latency | The 3:2 page ratio and the whole page layout |
| S0.2 | Cloudflare 429 taxonomy: how daily-allowance exhaustion differs on the wire from rate limiting | The failure model — this split is load-bearing |
| S0.3 | Gemini free tier: which models support `responseSchema`, current RPM and daily limits, output token ceiling, whether nesting at our schema depth is accepted | Model env var, pre-flight budget, chain caps |
| S0.4 | Vercel Hobby: confirm the `maxDuration` ceiling and that one image round-trip fits inside it | Route config |
| S0.5 | Whether the inference response reports neuron cost | Whether spend logging is measured or computed |

**On S0.1:** the ratio serves the endpoint, not the other way round. If 3:2 is
not cleanly supported, take the nearest supported landscape ratio and adapt the
layout.

**On S0.3:** put the verified model ID in an env var. Phase 1 runs with thinking
on — deriving a three-order causal chain is exactly that workload. The pre-flight
classifier runs with thinking off.

**On S0.5:** if cost is not reported, log the computed estimate per image and
reconcile against Cloudflare analytics separately.

### Findings — documentation pass

**S0.1 — settled, and it changed the design.** Flux Schnell accepts `prompt`
(1–2048 chars), `steps` (default 4, max 8) and `seed`. **No width or height
parameter exists.** Output is fixed, square, base64 JPEG in an `image` field.
Pages are 1:1; the composition clause already reserved the lower third, so the
layout carries over unchanged. The 2048-character cap is a hard constraint on
prompt assembly — see the character budget in [docs/SCHEMA.md](docs/SCHEMA.md).

Alternatives were rejected: `stable-diffusion-xl-lightning` takes width/height
but is weaker at prompt adherence, returns a stream rather than base64, and is
absent from the neuron pricing table entirely. Style adherence is the core
mechanism and is not worth trading for a ratio.

**S0.3 — partly settled.** Structured output supports everything the schema
needs: `enum`, `minItems`/`maxItems`, `anyOf`, `$ref`, `prefixItems`. Two
caveats vindicate the double-enforcement design — *"very large or deeply nested
schemas may be rejected"* (no published threshold) and *"always validate values
in your application"*. Free-tier RPM/RPD are **not published**; they are
per-account in AI Studio. Gemini RPD resets midnight **Pacific**, so the two
quotas reset at different times.

**S0.4 — settled, assumption corrected.** With fluid compute (default), Hobby is
300s default and 300s maximum, not 60s. `maxDuration` is a non-issue.

### Findings — live pass

Run against real credentials. Cost: 4 images (691 neurons, 6.9% of a day) and
about 30 Gemini calls.

**S0.1 — Flux Schnell emits 1024×1024 JPEG.** `{ result: { image, usage },
success, errors, messages }`, base64 in `result.image`, ~228 KB decoded per
plate. Latency across four calls: 1.7s, 2.2s, 2.6s, 4.5s. Three concurrent
requests — our real pool width — all returned 200 with no rate-limit headers, so
the pool does not throttle itself.

**S0.5 — solved, and it moves the budget.** The response carries a
**`cf-ai-neurons` header**: `172.80` for one 1024×1024 plate at 4 steps. Cost is
measured, never estimated. The published rates do reconcile — steps are billed
*per tile*, not per image:

```
neurons = 4.8 × tiles + 9.6 × tiles × steps
        = 4.8 × 4    + 9.6 × 4 × 4          = 172.80
```

**S0.2 — Gemini solved, Cloudflare partial.** A Gemini 429 is fully
self-describing and carries its own discriminator:

```
status: RESOURCE_EXHAUSTED
QuotaFailure.quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier"
QuotaFailure.quotaValue: "5"
RetryInfo.retryDelay: "44s"
```

`PerMinute` in the `quotaId` means back off by `retryDelay` and retry;
`PerDay` means the daily allowance is gone and the chapter halts. There is no
`retry-after` header — the delay is in the body.

Cloudflare's error envelope is `{ success: false, errors: [{ code, message }],
messages, result }` — an empty prompt returns 400 with `code: 5006`. The 429
codes remain uncaptured: forcing an allowance exhaustion costs ~10,000 neurons
and forcing a rate limit needs a burst far past our pool width, neither of which
is worth the spend. **Instrument instead:** log the entire envelope, headers
included, on every non-200 from the image route, so the first real occurrence
identifies itself. Until then, treat an unclassified 429 as bounded backoff, and
halt as quota only once the retries are exhausted — the safe reading in both
directions.

**S0.3 — solved, with one schema change.**

- **`gemini-3-flash` does not exist.** ListModels 404s it; `.env.local` now
  holds `gemini-3.6-flash`, verified end to end.
- **`minItems` / `maxItems` are rejected.** The full schema carrying them returns
  400 `INVALID_ARGUMENT` with no field detail; stripping them makes the identical
  schema pass. Array bounds cannot be expressed in `responseSchema` at all.
- **`anyOf` works.** The `Ref` discriminated union survives intact, nested inside
  array items.
- **Truncation is not a live risk.** A full chapter came back in 40.5s with
  `finishReason: STOP`, spending 3,162 output tokens and 4,710 thinking tokens
  against a 65,536 ceiling — roughly 5% of the budget. Every Flash candidate
  (`3-flash-preview`, `3.5`, `3.6`, `3.7`, `flash-latest`) reports the same
  1,048,576 in / 65,536 out.
- **The live chapter passed all thirteen rules on the first attempt**, styleBible
  536/600 characters, longest assembled prompt 904/2048, page prose 30–37 words.
  `npx tsx scripts/check-live.ts <response.json>` re-runs that check on any
  captured response.

**Free-tier rate limits, measured.** `gemini-3.6-flash` is **5 RPM**.
`gemini-3.1-flash-lite` took 12 concurrent without limiting, so its ceiling is
higher and unmeasured. Quotas are **per project per model**, so the pre-flight
classifier and the chapter call draw on separate budgets. RPD is still unknown —
it cannot be measured without exhausting it.

## Budget

Measured, not estimated — the `cf-ai-neurons` response header reports the cost of
every call.

**172.80 neurons per plate** at 1024×1024 and 4 steps. ×12 pages =
**2,073.6 per chapter**. Against 10,000/day that is **4.8 chapters/day**.

That is three times the original estimate, because steps are billed per tile:
`4.8 × tiles + 9.6 × tiles × steps`. Store the header value on the image record;
never recompute it.

**Steps are the only cost lever**, and the relationship is linear in
`tiles × steps`. Dropping to 2 steps would cost 96 neurons per plate and buy
~8.6 chapters/day; 1 step costs 57.6 and buys ~14.5. Flux Schnell is distilled
for 4, so this trades image quality directly for volume. Left at 4 until there
is a reason to move it.

The allowance resets at **00:00 UTC**.

Page 0 costs nothing — it is app-rendered SVG.

The halt banner states when generation comes back, not merely that it is gone.

## Phases

Status: **1–7 built and browser-tested.** Verified by `npm run check:fixture`,
`npm run check:queue`, `npm run typecheck`, `npm run lint`, `npm run build`, plus
live runs of the pre-flight classifier, chapter generation (chapters 1, 2 additive
and 3 contradictory, each passing all thirteen rules on the first attempt) and one
real plate through the image route.

| Phase | | Notes |
|---|---|---|
| 1 Schema and validator | ✅ | 13 rules, fixture chapter, `check:fixture` |
| 2 Reader against the fixture | ✅ | Mobile still untested |
| 3 Pre-flight classifier | ✅ | All three verdicts confirmed live |
| 4 Phase 1 generation | ✅ | Chapters 1–3 live, zero retries needed |
| 5 Image pipeline | ✅ | 34 paths on a fake transport; 5 real plates total |
| 6 Chapter 2 and beyond | ✅ | Additive and contradictory both live |
| 7 Durability and housekeeping | ✅ | Resume, export, neuron totals, deletes |

A full end-to-end run in the browser then lost ten of twelve plates. It was
diagnosed as refusal clustering and was nothing of the kind — see Known issues.

### 8. Failure legibility and the reading-first flow

**Ten-plate loss** — fixed and verified at 12/12 on the rule that caused it.
Cause was a rejected request field, not rejected subjects. The plumbing was
wrong in two places and the prompts were fine.

**Land on the story, not the mechanism** — done. The reasoning diagram is out of
the reading order and behind a *how this world works* control; the book opens on
plate 1; the waiting screen says *imagining your world…*. Arrow keys and swipe
through the twelve plates are the main event, and the diagram no longer sits
between one chapter's last plate and the next chapter's first.

**Story mode, told forward rather than derived** — built, not yet run live.
Pre-flight has classified `story` since phase 3, but every story still went
through the rule pipeline, and the composer said so in an apology under the
restatement. "A boy was riding his bicycle and got hit by a car" came back as
twelve pages about road safety. In story mode the chain is now twelve **beats**
instead of twelve effects, rule 7 relaxes from four domains to two so the model
stops conscripting an economics beat to fill a quota, and the prompt bans the
society-wide essay outright. The JSON contract is unchanged, so the reasoning
diagram, prompt assembly, the render pool and the reader are all untouched. The
mode travels to storage and into the export, because a chapter reviewed without
it is reviewed against the wrong brief.

**Plain English on the page** — the voice rules were mostly advice; now they are
checked. No sentence over 22 words, no semicolons, and the register blocklist
finally fires: every stem entry in it (`illuminat`, `utilis`, `colonis`,
`facilitat`) was wrapped in `\b…\b` and could never match the inflected word it
named, so the list had been enforcing nothing since it shipped. It also grew two
families it was missing — the politics-and-economics briefing and the literary
flourish. The fixture chapter was rewritten to meet the new rules; seven of its
twelve pages failed them, which is the measure of how far the register had
drifted.

### 9. Distinct plates, and a book instead of a deck

Two complaints prompted this: the plates all look similar regardless of the
story, and the pages still read as an infographic rather than a story. Both had
measurable causes.

**Options considered and ruled out, for image generation.** A Google-login-based
route to Nano Banana was proposed to spread cost across users and get a better
model. Neither survived research: every Gemini image model's pricing page reads
`Free tier: Not available` — the free consumer-app allowance is a different
surface from the API — and there is no OAuth scope that lets an app spend a
signed-in user's consumer quota; it is an open feature request on Google's own
developer forum, not a capability. Upgrading the Cloudflare model
(`flux-2-klein`, `lucid-origin`) was also priced out: 8–20× Flux Schnell's cost,
dropping the app under one chapter a day. If multi-user scaling ever matters,
the answer is bring-your-own-**Cloudflare**-token (also free, no card) — not
attempted here, just the identified path.

**The plates looked alike because the prompt did, not because of the model.**
`npm run check:fixture` already measured it: the scene was 18% of the average
assembled image prompt, 17% at worst. The other ~82% — styleBible, visual laws,
entity descriptions — is byte-identical across all twelve plates and sat at the
*front*, where diffusion models weight tokens heaviest. Fixed three ways: the
scene now leads the assembled prompt (`lib/prompt.ts`), the shared caps shrank
(`PROMPT_LIMITS` in `lib/types.ts`: styleBible 600→320, visualLaw 100→70,
entityDescription 180→110), and a new rule 19 rejects any plate whose scene
falls under 40% of the assembled prompt. Measured on the rewritten fixture:
scene share moved to 42% average, 40% at worst.

**The infographic feel survived plain vocabulary.** Rule 18 already bans long
sentences, semicolons and stiff words, and it works — but nothing stopped a
page from being grammatically plain while still reading as an exhibit caption:
habitual-tense summary ("launches nine times a day", "keeps eleven beds and is
rarely full") and every page opening on the landmark's name ("The Spindle
rises...", "Halfweight Port launches..."). Two new checked rules: 21 rejects the
habitual register (present tense stays fine; generalising does not), 22 caps
gazetteer-style openings at 4 of 12 pages. A third gap was structural rather
than lexical — nothing carried a reader from page 3 to page 4. `throughLine` is
new on the contract: one unnamed role a chapter chooses before writing pages,
whose `headNoun` rule 20 requires on at least 7 of 12 pages, checked
mechanically so a declared-but-absent thread cannot pass as solved.

The fixture chapter was rewritten against all of this — richer, longer scenes
(390→480+ characters typical), a through-line (`the rope crew`), habitual
phrasing rewritten to specific occasions, gazetteer openings reduced to within
the cap. `check:fixture` passes on the rewrite; it did not on the first attempt,
which is the measure of how far both problems had drifted. Not yet run live:
next verification is one real chapter, checked against rules 19–22 on the first
attempt and read cold from the export to judge whether it reads as one story.

### 1. Schema and validator
Types and Zod validators from [docs/SCHEMA.md](docs/SCHEMA.md). A checked-in
fixture chapter in `fixtures/` that passes every rule, plus deliberately broken
fixtures for the validator tests. No API calls in this phase.

### 2. Reader shell, against the fixture
Library screen, square full-bleed pages, text band over the lower third with a
gradient scrim, arrow keys and swipe, placeholder frames, page 0 rendered
deterministically from the fixture's chain. Bidirectional navigation: an effect
node jumps to its page, each page carries a back-link to its originating node.

Mobile: the text band moves below the image rather than over it; page 0 scrolls
or pages horizontally by order.

This phase burns zero quota. Get the reading experience right here.

### 3. Pre-flight classifier
One tiny Gemini call, thinking off, ~50 output tokens, returning
`{ verdict, interpretedRule, reason }`.

Gemini calls are abundant; Cloudflare neurons are scarce. Spending a cheap call
to avoid wasting 690 neurons on a misread rule protects the scarce resource.

UI shows **"Interpreted as: …"** with Confirm and Edit. Only Confirm fires the
chapter call. The `interpretedRule` is what enters canon and renders on page 0 —
the raw input is never stored as the rule.

`unusable` verdicts reject with a nudge and two example rules, which teaches the
rule format by example rather than by error message.

### 4. Phase 1 generation
Route handler → Gemini with `responseSchema` → validate → persist. On violation
or truncation, one retry with the violation list appended to the prompt, then
visible failure with the raw response retained for debugging.

**The `responseSchema` must not carry `minItems` or `maxItems`** — Gemini rejects
the whole request. Every array bound is prompt-instructed and validator-enforced,
which is the arrangement the contract already assumed.

At 5 RPM, a chapter call plus its retry is comfortable, but two chapters inside a
minute is not. A `PerMinute` 429 is a wait, not a failure: sleep `retryDelay` and
resume.

### 5. Image pipeline
Route handler generating exactly one image. Client-side pool of 3, page 1 first,
then reading order. Progressive fill as blobs arrive; text never waits.

Failure taxonomy:

| Condition | Action |
|---|---|
| 429, daily allowance exhausted | Halt the pool. Keep completed pages. Banner the 00:00 UTC reset. |
| 429, rate limited | Bounded backoff, then retry. Only a genuine exhaustion halts. |
| 429, unclassified | Back off; halt as quota only after the retries are exhausted. |
| 5xx | One retry, then mark the chapter errored. |
| 4xx, safety refusal or rejected prompt | Styled placeholder on that page. **Pool continues.** |

Log the full error envelope and headers on every non-200 — that is how the
Cloudflare 429 codes get identified, since forcing them costs more than it is
worth.

On the Gemini side the classification is already free: read
`details[].QuotaFailure.violations[].quotaId` and branch on `PerMinute` versus
`PerDay`, honouring `RetryInfo.retryDelay` from the body rather than looking for
a `retry-after` header, which is not sent.

Gemini exhaustion and Cloudflare exhaustion are different states with different
resets and different words: the first means no chapter at all, the second means
text and a partial chapter. Their days end at different times too — Cloudflare at
00:00 UTC, Gemini at midnight Pacific.

### 6. Chapter 2 and beyond
Canon replacement, chapter digests, the interaction assertion, and the
contradiction path — classification, `supersededRules`, and an opening that
narrates the transition itself. The day gravity came back is the richest chapter
this app can produce; it is not a retcon to be smoothed over.

### 7. Durability and housekeeping
- `navigator.storage.persist()` on first world creation.
- Storage used, shown on the library screen.
- Per-world delete plus a global delete-everything, both two-step confirmed. No
  accounts means no recovery.
- Resume after a quota halt: re-check quota state **before** restarting the
  pool, rather than retrying the failed page and rediscovering the halt.
- Export a world as JSON — canon, chain, pages, assembled prompts, seeds.
  Images excluded so it stays small. It makes debugging far easier and it is the
  substrate sharing is built on later.

A world silently evicted with no warning is the worst failure available to an
app with no accounts. This phase is not optional polish.

## Known issues

**Ten of twelve plates lost to a rejected request field — misread for a day as
safety refusals.** *Fixed 2026-08-14. Kept because the misdiagnosis is the
lesson.*

| | |
|---|---|
| Rule | `humans live only 10 years` |
| Result | **10 of 12 plates withheld**, 2 drawn, ~346 neurons |
| Believed cause | Flux rejecting bodies/ageing as a subject |
| Actual cause | `seed` is no longer in the flux-1-schnell input schema |

Workers AI now answers any request carrying `seed` with:

```
HTTP 400, code 5006
AiError: Bad input: Additional or unevaluated properties '/seed' at '/' not allowed
```

`classify()` funnelled every 4xx that was not 401/403/429 into `kind: 'refused'`,
which is terminal and per-plate. So a malformed request — identical on all twelve
pages — was recorded twelve times as "this subject was rejected". The rejection
is intermittent (Cloudflare appears to have been mid-rollout; ~2 in 12 got
through), which is exactly what made it look like a content pattern.

**The evidence that settles it**, from the exported world's twelve real prompts:

- Three refused plates (3, 8, 12) contain no people at all — server racks, crane
  drones, a schematic flowchart. Nothing to refuse.
- The single most on-the-nose prompt in the set — plate 5's *"a crowd of
  nine-year-old elders"* — **drew**.
- Refusals returned in 200–400 ms; successes took 1.6–4.6 s. The rejection
  happened before generation, so it was never about the image.
- Replaying the four most body-and-age-loaded prompts with `seed` removed:
  **4 of 4 drew**, concurrently. Including plate 1's *"four-year-old human figure
  with adult stature"*, the prompt originally blamed for the whole cluster.

Content was never the problem. A prompt rule or validator check constraining
`imagePrompt` to "situations, not bodies" would have cost real expressive range
and fixed nothing.

**What changed:**

1. `seed` is no longer transmitted (`lib/cloudflare.ts`). Plates are therefore no
   longer reproducible from their seed; the field is kept for provenance only.
2. `bad_request` is a distinct failure kind and halts the run. A rejected request
   shape is prompt-independent, so it must stop the pool rather than degrade into
   twelve placeholders.
3. `failureCode` and `failureMessage` are persisted per plate and included in the
   export (v2). The absence of these is what made this take a live replay.
4. A circuit breaker (`REFUSAL_STREAK_LIMIT`) halts the pool after four
   consecutive refusals with nothing drawn. Scattered refusals still degrade
   gracefully; a systemic fault stops and says so.

**Verified.** The same rule, `humans live only 10 years`, re-run end to end on
2026-08-14 after the fix: chapter valid on the first attempt with zero
violations, **12 of 12 plates drawn**, none withheld, no halt, 2074 neurons.
The acceptance bar was 1–2 lost; the answer is none.

**The lesson.** Two plates drew, so the pipeline looked alive and the failure
looked selective. A catch-all error bucket turned one bug into a pattern that
appeared to be about meaning, and the pattern was convincing enough to be written
into this document as fact. Persist the upstream code before theorising about
cause — the whole misdiagnosis rests on `{}` in a log line.

The bar stands: rules touching bodies, ageing and violence are a large share of
what this app exists to answer. Losing 1–2 plates is graceful degradation.
Losing 10 is an unusable product.

**Known limitation, accepted deliberately: plates are no longer reproducible.**
Dropping `seed` from the request (the fix above) means a retry of the same
prompt draws a *different* image, not the same one. This was traded away on
purpose to stop losing whole chapters to a 400 — reproducibility was never the
thing at risk. Revisit if Workers AI restores `seed` to the schema, or if
"regenerate this exact plate" becomes a wanted feature; the derivation in
`lib/seed.ts` is kept alive for exactly that reason, it's just unused for now.

**The production build runs on webpack, not turbopack.** `next build` with
turbopack fails to resolve `@vercel/turbopack-next/internal/font/google/font`
for every `next/font/google` face, so `npm run build` passes `--webpack`.
`next dev` is unaffected and still uses turbopack. Revisit on the next Next.js
upgrade; if it is fixed, drop the flag. Self-hosting the fonts through
`next/font/local` is the fallback if it is not.

## Out of scope for v1

Sharing and hosted galleries. JSON export is in; nothing else is.
