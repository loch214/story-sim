# Story-sim

A picture-book world simulator. You type one rule — "gravity is half as
strong", "a world without women" — and the app generates a 12-page illustrated
atlas of the world that results, read with arrow keys or swipe. Add another
rule later and it appends a new chapter to the same world, reasoning about how
the new rule interacts with what's already there.

## How it works

1. **Pre-flight** — a small Gemini call checks that what you typed is usable
   as a rule (or a story to continue) and restates it back to you before
   anything is built.
2. **Chapter generation** — Gemini derives a causal chain (first, second and
   third-order effects of the rule), then writes 12 pages of prose from the
   most interesting consequences, plus an image prompt for each page.
3. **Illustration** — Cloudflare Workers AI (Flux Schnell) draws each page's
   image, one HTTP request per image, three at a time.
4. Everything is stored in IndexedDB in your browser. There's no backend
   database, no accounts, no login — a world lives only in the browser that
   made it.

The first chapter also generates a `styleBible` (art style, palette,
architecture) that's frozen and reused verbatim for every later chapter, so
the illustrations of one world stay visually consistent even though each image
is generated independently.

## Tech stack

- [Next.js](https://nextjs.org) (App Router) + TypeScript + Tailwind
- [Google Gemini](https://ai.google.dev) for reasoning (chapter generation and
  the pre-flight rule classifier)
- [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/)
  running Flux Schnell for images
- IndexedDB for client-side storage — no server-side database
- Deployed on Vercel

## Running it locally

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

Create `.env.local` in the project root:

```bash
# Cloudflare Workers AI — images
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=

# Google Gemini — reasoning
GEMINI_API_KEY=
GEMINI_MODEL=
GEMINI_PREFLIGHT_MODEL=
```

Where to get each value:

- `CLOUDFLARE_ACCOUNT_ID` — dash.cloudflare.com → Workers & Pages → Overview
  (right sidebar)
- `CLOUDFLARE_API_TOKEN` — dash.cloudflare.com/profile/api-tokens → Create
  Token, with **Workers AI — Read** and **Workers AI — Run** permissions
- `GEMINI_API_KEY` — aistudio.google.com/apikey
- `GEMINI_MODEL` / `GEMINI_PREFLIGHT_MODEL` — model IDs available on your own
  Gemini free tier. Check what's currently offered in AI Studio rather than
  copying model names from elsewhere; the free tier's available models change
  over time. `GEMINI_MODEL` needs thinking support for chapter generation;
  `GEMINI_PREFLIGHT_MODEL` just needs to be fast and cheap, since it only
  classifies short input.

Every path in this app runs on a recurring free tier. When a daily quota is
exhausted, the app stops and tells you when it resets — there's no paid
fallback.

### 3. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Checks

These run against a checked-in fixture chapter and a fake image transport, so
they cost nothing:

```bash
npm run typecheck
npm run lint
npm run check:fixture   # fixture chapter against every validation rule
npm run check:queue     # image render pool: halts, retries, refusals, resume
```

To validate a real captured Gemini response against the same contract:

```bash
npx tsx scripts/check-live.ts <response.json>
```

## More detail

- [`docs/SCHEMA.md`](docs/SCHEMA.md) — the data contract, validation rules,
  and how image prompts get assembled
- [`PLAN.md`](PLAN.md) — build order, known issues, and the quota/cost budget
- [`AGENTS.md`](AGENTS.md) / [`CLAUDE.md`](CLAUDE.md) — project conventions
  for coding agents working in this repo
