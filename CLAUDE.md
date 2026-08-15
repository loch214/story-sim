@AGENTS.md

# Story-sim

A picture-book world simulator. One rule in ("gravity is half as strong"), an
illustrated **atlas** of the resulting world out, read with arrow keys. Adding a
rule appends a chapter to the same world; accumulated rules interact.

Next.js App Router + TypeScript + Tailwind on Vercel. Gemini for reasoning,
Cloudflare Workers AI (Flux Schnell) for images, IndexedDB for storage. No
backend database, no accounts, no login.

- Data contract, validation rules, prompt assembly — [docs/SCHEMA.md](docs/SCHEMA.md). Read it before touching generation.
- Build order, spikes, failure model, quota budget — [PLAN.md](PLAN.md).

## Checks

`npm run check:fixture` — the fixture chapter against all fifteen rules, prompt
assembly, and the page 0 layout maths.
`npm run check:queue` — every render-pool path (halt, retry, refusal,
concurrency, resume) against a fake transport, at zero neuron cost.
`npx tsx scripts/check-live.ts <response.json>` — a captured Gemini response
through the real contract.

## Invariants

**Free tiers only.** Every path runs on a recurring free tier. When a quota is
exhausted the app stops and says so. No paid provider exists in the dependency
tree, behind a flag, or commented out.

**One image per HTTP request.** The client fires 12 requests through a pool of
3; the route handler generates exactly one image and returns. A serverless
function that loops over pages times out on Vercel.

**Fixture-first.** UI work runs against the checked-in fixture chapter in
`fixtures/`. Cloudflare neurons are the scarce resource — spend them verifying
generation, not iterating layout.

**Square pages.** Flux Schnell accepts no width or height parameter, so output
is fixed and square. The text band sits over the lower third, which the
composition clause already reserves.

**Frozen styleBible.** Chapter 1 generates it. Every later chapter receives it
verbatim as input and returns no styleBible of its own. It is the only thing
holding twelve independently generated images into one visual world.

**Replacement canon.** Each chapter returns a complete new `worldCanon` that
supersedes the previous one entirely. Discard the old; never merge.

**Pinned baseline.** `"present-day Earth, except:"` — a rule is only legible as
divergence from the known world.

**The rule must reach the illustrator.** Flux sees the image prompt and nothing
else — not the rule, not the chain, not the page text. Where the prompt is
silent it draws the present-day world, so "a world without men" came back full
of men. `worldCanon.visualLaws` are the channel: short, positive, visual
statements of what is always on screen, spliced into every prompt twice (front
and tail) and never trimmed. **Phrase them as presence, never absence** — there
is no negative-prompt parameter, so naming a thing to forbid it only summons it.
The validator rejects negations.

**A book, not a survey — and not a character study either.** Pages are read in
order and something must develop across the twelve: each chapter picks its own
`arc` of 2–5 movements to fit its premise, and the validator enforces only that
they tile the pages. Continuity comes from **recurring places and objects**
(`namedEntities[].visualDescription`, the one thing Flux can hold across
independent images) and from **unnamed roles** — "the night crew", "the last
mechanic". Never a recurring named character or a described face: naming someone
promises a face that twelve independent generations cannot keep. Figures stay in
crowds, mid-distance, backs turned.

**No fixed act structure.** The arc is chosen per premise — a rule lasting a day
and one reshaping generations must not share a rhythm. A template would make
every world in the library feel the same.

**Derivation is checkable.** Chain nodes declare what caused them, pages declare
which effect they dramatise, and the validator enforces both. A chapter whose
chain never touches prior canon has failed the brief and is rejected.

**Pages are selected from the chain, never printed off it.** One page per node
in id order is the model's default and it is what made the book read as twelve
disconnected facts. At least one effect carries several pages, some get none,
and page order serves the reading. `derivedFrom` is a citation, not a running
order.

**Two registers, and never mix them.** The chain is analysis and stays precise.
Page text is for a normal reader: ordinary words where they exist ("underground
trains", not "subterranean transit systems"), varied sentence length, and
allowed to be funny or sad rather than uniformly neutral. Rule 18 checks page
text only.

**Calibrate thresholds against live output, not intuition.** A chapter gets one
retry. A limit set slightly too tight spends it on a near-miss and leaves none
for a real fault — which is how both the short-sentence and visualLaw caps were
first set wrong.

**The scene must dominate the image prompt.** Every plate shares the styleBible
and the laws, so the scene is the only thing distinguishing one page from the
next. When the shared prefix was ~80% of the prompt, every image looked the
same.

**If it is not in the export, it does not exist.** The export is the artefact
used to review a chapter. `arc` was persisted from the day it shipped but never
exported, which read as the feature never having landed.

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

**Gemini rejects `minItems` and `maxItems`.** Array bounds cannot go in
`responseSchema` at all — they live in the prompt and in `lib/validate.ts`.
`anyOf` is fine.

**A plate costs 172.80 neurons**, measured from the `cf-ai-neurons` response
header — three times what the rate card reads like, because steps are billed per
tile. That is ~4.8 chapters a day. Never debug the image pipeline against the
live endpoint; `lib/imageQueue.ts` takes an injectable transport for exactly
this reason.

**Deterministic layout.** The LLM supplies structure plus palette and motif
hints; the app computes every coordinate. Page 0 is app-rendered SVG.
