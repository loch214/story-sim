@AGENTS.md

# Story-sim

A picture-book world simulator. One rule in ("gravity is half as strong"), an
illustrated **story** set in the resulting world out, 12–15 pages, read with
arrow keys. Adding a
rule appends a chapter to the same world; accumulated rules interact.

Next.js App Router + TypeScript + Tailwind on Vercel. Gemini for reasoning,
Cloudflare Workers AI (Flux Schnell) for images, IndexedDB for storage. No
backend database, no accounts, no login.

- Data contract, validation rules, prompt assembly — [docs/SCHEMA.md](docs/SCHEMA.md). Read it before touching generation.
- Build order, spikes, failure model, quota budget — [PLAN.md](PLAN.md).

## Checks

`npm run check:fixture` — the fixture chapter against every validation rule,
prompt assembly, and the page 0 layout maths.
`npm run check:queue` — every render-pool path (halt, retry, refusal,
concurrency, resume) against a fake transport, at zero neuron cost.
`npx tsx scripts/check-live.ts <chapter.json>` — a captured chapter through the
real contract.

## Invariants

**Free tiers only.** Every path runs on a recurring free tier. When a quota is
exhausted the app stops and says so. No paid provider exists in the dependency
tree, behind a flag, or commented out.

**One image per HTTP request.** The client fires one request per page through
a pool of 3; the route handler generates exactly one image and returns. A serverless
function that loops over pages times out on Vercel.

**Fixture-first.** UI work runs against the checked-in fixture chapter in
`fixtures/`. Cloudflare neurons are the scarce resource — spend them verifying
generation, not iterating layout.

**Square pages.** Flux Schnell accepts no width or height parameter, so output
is fixed and square. The text band sits over the lower third, which the
composition clause already reserves.

**Frozen styleBible.** Chapter 1 generates it. Every later chapter receives it
verbatim as input and returns no styleBible of its own. It is the only thing
holding independently generated images into one visual world. It describes how
pictures are *drawn*, never what is in them — architecture in the styleBible
puts the same buildings on every plate.

**Replacement canon.** Each chapter returns a complete new `worldCanon` that
supersedes the previous one entirely. Discard the old; never merge.

**Pinned baseline.** `"present-day Earth, except:"` — a rule is only legible as
divergence from the known world.

**Story first, then plates.** A chapter is two Gemini calls. Step 1 writes the
story as plain prose — one hero, a want, a turn, an ending that answers the
opening — checked only for page count (12–15, the writer's choice) and page
length. Step 2 reads the finished story and returns, as JSON, the styleBible,
canon, hero, chain, arc and one image prompt per page — never page text, so its
retry cannot touch the prose. The single-call design built pages from a causal
chain under two dozen constraints and every book read like a slide deck. The
chain is now the analysis behind the story, written after it. See
docs/SCHEMA.md § Chapter generation.

**Validation checks structure and what reaches the illustrator — never prose
style.** Rules 7 and 16–22 (domain quotas, entity scattering, sentence caps,
stiff-word lists, through-line word counts) were retired: each patched one
symptom, together they made the model write to a checklist, and none could
create a plot. Voice is taught in the step 1 brief. Keep it that way.
Bookkeeping faults with one unambiguous fix — chain links, citations, caps,
arc tiling — are repaired in `lib/repair.ts`, never sent back: a book was
once discarded twice over one wrong arrow in the diagram.

**A hero, drawn by costume.** The reader follows `hero` — a name is allowed in
text. Pictures hold them with `hero.look` (age, build, clothes, colours, one
carried thing), spliced verbatim into every plate with `heroInScene`, the same
mechanism that keeps `namedEntities` consistent. Never a face: independent
generations hold a red smock, not features. Every other character on two or
more pictures is a `person` entity held the same way, spliced right after the
hero — the little sister left to each scene's wording changed clothes three
times. Both carry an age (rule 26): "a tall slender girl" was drawn as a woman
on some plates and a teenager on others.

**The trouble comes from the rule.** The step 1 writer plans first (`PLAN`:
trouble, want, turn, ending, open questions) and the trouble must exist only
because of the change. A well-told story about a lost letter in a snowstorm, in
"a world without men", is the wrong story. The plan is exported for review.

**The rule must reach the illustrator.** Flux sees the assembled image prompt
and nothing else, and draws the present-day world wherever it is silent — so "a
world without men" came back full of men. Two canon fields carry the rule:
`visualLaws` state positively what is always on screen and are spliced into
every plate; `neverDrawn` lists the words that would summon what the rule
removed and is **never sent to Flux** — rule 23 proves no field that reaches it
contains one, and rule 24 rejects vague people words ("commuters") where the
rule changes who exists. Phrase laws as presence, always: there is no negative
prompt, so naming a thing summons it.

**Order is priority in the image prompt.** Flux's text encoder reads ~256
tokens (~1,000–1,100 characters) and drops the rest. Assembly runs scene → hero
look → laws → entity → shot → styleBible → composition, capped so a typical
plate stays under 1,000 characters; if anything is clipped it is style. The
laws used to sit ~1,300 characters in. See docs/SCHEMA.md § Image prompt
assembly.

**Field order is set, not assumed.** Gemini writes JSON properties
alphabetically unless every object carries `propertyOrdering` — the old schema
had `pages` written before the `worldCanon` they had to obey. `check:fixture`
fails on any object without it.

**Two pipelines behind one contract.** Pre-flight decides `mode`. A `rule`
becomes a story set in a world where it holds; a `story` is continued and
finished. Only step 1's brief and step 2's description of the chain (twelve
consequences vs. twelve beats) differ.

**No fixed act structure.** The arc is chosen per story — a rule lasting a day
and one reshaping generations must not share a rhythm. Rule 15 checks only that
movements tile the pages.

**Derivation is checkable.** Chain entries declare what caused them and pages
cite the entry they show. Chapter 2+ must reference prior canon in its chain.

**Calibrate thresholds against live output, not intuition.** A chapter gets one
retry. A limit set slightly too tight spends it on a near-miss and leaves none
for a real fault — which is how both the short-sentence and visualLaw caps were
first set wrong, and later the movement-label (6 words) and scene (150 chars)
floors, which failed a finished chapter over a 7-word heading and 117-character
scenes. Ask for the target in the prompt; reject only well past it
(`*_TARGET` vs `*_MAX`/`*_MIN` in lib/types.ts).

**Google's image models have no free API tier, and there is no way around it
via login.** Every Nano Banana / Gemini image model's pricing page reads
`Free tier: Not available`; the free allowance people mean is the *consumer
app*, a separate surface from the API. There is also no OAuth scope that lets
an app spend a signed-in user's consumer quota — no such delegation exists.
Ruled out during a provider investigation; do not re-propose without new
information from Google. If Cloudflare's free 10k-neurons/day tier ever stops
being enough for multiple users, the answer is bring-your-own-**Cloudflare**-
token (also free, no credit card), not a Gemini image key.

**If it is not in the export, it does not exist.** The export is the artefact
used to review a chapter. `arc` was persisted from the day it shipped but never
exported, which read as the feature never having landed. New chapter fields go
into `lib/export.ts` with a version bump.

**Quota halts; nothing else does.** Daily allowance exhausted → stop the pool,
banner the reset time, keep completed pages. A safety refusal or bad prompt on
one page → styled placeholder, pool continues.

**A refusal bucket must not be a catch-all.** Ten plates were once thrown away as
safety refusals when the real fault was a request field the schema had dropped —
because every unrecognised 4xx was classified `refused`, which is terminal and
per-plate. A prompt-independent failure halts (`bad_request`); only a genuine
per-subject rejection degrades to a placeholder. Persist `failureCode` and
`failureMessage` on the plate: cause is diagnosed from the record, never inferred
from which pages happen to have failed. See PLAN.md § Known issues.

**No `seed`.** Workers AI removed it from the flux-1-schnell input schema;
sending it is a 400. Plates are not reproducible — the stored seed is provenance
only.

**One action, one result.** Confirming the pre-flight restatement both writes the
chapter and draws its plates. Pre-flight *is* the confirmation step, so there is
no second one; the neuron cost rides on the button that commits.

**Model IDs live in env vars**, set from what Spike 0 verified is on the current
free tier. Write model names from verification, never from memory.

**Gemini's daily cap is the binding limit, and 503s spend it.** gemini-3.6-flash
on the free tier is 20 requests a day per Google project (read from the 429's
`quotaValue`, 2026-10-14). A chapter costs 2 when nothing fails, and every
"high demand" 503 — and every retry of one — counts. So a busy model hands
over to the next in `GEMINI_FALLBACK_MODELS` (each has its own allowance)
rather than being hammered; `GEMINI_LAST_RESORT_MODELS` (Lite) is tried only
after those have each had two chances — as an ordinary fallback Lite answered
first every time and wrote every story, and its stories ignored the rule; and a finished story is never thrown away because
step 2 failed: it rides back to the client as `draft` and is resent on retry.
Quick same-model retries once burned a day's allowance in an afternoon of
tests that read as "always overloaded".

**Gemini rejects `minItems` and `maxItems`.** Array bounds cannot go in
`responseSchema` at all — they live in the prompt and in `lib/validate.ts`.
`anyOf` is fine.

**A plate costs 172.80 neurons**, measured from the `cf-ai-neurons` response
header — three times what the rate card reads like, because steps are billed per
tile. A chapter is 2,074–2,592; that is 3.8–4.8 chapters a day. Never debug the image pipeline against the
live endpoint; `lib/imageQueue.ts` takes an injectable transport for exactly
this reason.

**Deterministic layout.** The LLM supplies structure plus palette and motif
hints; the app computes every coordinate. Page 0 is app-rendered SVG.
