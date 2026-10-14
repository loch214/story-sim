# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Curious readers and worldbuilders — writers, GMs, designers, science-fiction
readers, teachers — who enjoy the "what if" thought experiment but have no
patience for a wall of text. They arrive with a single premise in their head
("what if gravity were half as strong") and want to *see* the consequences,
not read an essay about them. No account, no setup, no prior knowledge of the
tool. Sessions are short and self-contained: type a rule, read twelve pages.

Secondary audience: people arriving from a shared link who want to understand
what the thing is in ten seconds without typing anything.

## Product Purpose

Story-sim turns one changed rule of reality into an illustrated twelve-page
picture-book chapter — a small atlas of the world that results. Success is a
reader finishing all twelve pages and feeling the world hang together, then
adding a second rule to the same world to see the two compound.

## Positioning

The differentiator is **compounding worlds with a frozen visual identity**.
Chapter 1 generates a `styleBible` that every later chapter receives verbatim,
so twelve independently generated images read as one world. Each new rule
replaces the world's canon entirely rather than appending to it, so rules
genuinely interact instead of stacking as a list. A generic image-prompt toy
cannot truthfully claim either.

The reasoning is also **shown, not asserted**: every page cites the chain node
it dramatises, and the app renders that derivation as a diagram.

## Operating Context

- Read with arrow keys, one plate at a time — deliberately a book, not a feed.
- Everything lives in the visitor's browser (IndexedDB). No accounts, no login,
  no server-side database. Worlds are lost if the browser data is cleared.
- Pre-flight restates the rule; confirming it both writes the chapter and draws
  its plates. One action, one result.
- A checked-in fixture world, "The Long Fall" (rule: *gravity is half as
  strong*), can be loaded for free to read a finished chapter.

## Capabilities and Constraints

- **Free tiers only.** Gemini for reasoning, Cloudflare Workers AI (Flux
  Schnell) for images. When a daily quota is exhausted the app stops and says
  so. No paid provider exists anywhere in the tree.
- A plate costs 172.80 neurons; the free allowance is ~4.8 chapters per day
  across all users. Generation is genuinely scarce and the UI must not imply
  otherwise.
- Images are fixed square (Flux Schnell takes no width/height), so pages are
  square with a text band over the lower third.
- Twelve pages per chapter. One image per HTTP request, fired through a pool
  of three.
- Quota exhaustion halts the pool and banners a reset time; a per-page refusal
  degrades to a styled placeholder and the pool continues.
- Terminology that is load-bearing in code, docs and the export: **world**,
  **chapter**, **rule**, **plate**, **page**, **chain**, **canon**,
  **styleBible**, **arc**, **through-line**.
- **The interface speaks plain language** (2026-10-14). Most readers are not
  technical, so on screen these become: book (a world), "what if" (a rule),
  picture (a plate), page, "how this world works" (the chain), drawing style
  (the styleBible). Neurons, quotas, canon, fixture, pipeline and model names
  never appear in the UI; cost is stated as books per day. Server error text
  is kept behind a "Technical details" fold, never as the headline. Controls
  are sentence case in the reading face (`.btn`, `.btn-primary`,
  `.btn-quiet` in `app/globals.css`); `.mono` is for page numbers and small
  labels only.
- Stack: Next.js 16 App Router, React 19, TypeScript, Tailwind v4, deployed on
  Vercel. Motion library: `motion` (Framer Motion), approved 2026-08-29 for the
  landing surface.

## Brand Commitments

- Name: **Story-sim**. Tagline in use: *"Change one rule of reality. Read the
  world that results."*
- Voice: quiet, exact, unhyped. The app's own chrome describes itself as a
  cool, dim **instrument** — a plate viewer. The artwork is the only warm thing
  on screen, and that is the point of the product.
- Typography is fixed and load-bearing: Fraunces (display/naming), Newsreader
  (prose), IBM Plex Mono (taxonomy — orders, domains, page numbers, statuses,
  never prose).
- Chrome palette is fixed in `app/globals.css`; accent colour is *not* fixed —
  each world tints its own chrome from its `styleBible` palette.
- Two registers, never mixed: the chain is analysis and stays precise; page
  text is somebody telling you what happened, casually. Marketing copy follows
  the app's own quiet register — no exclamation marks, no "revolutionary".

## Evidence on Hand

- Real, complete fixture chapter at `fixtures/chapter-1.ts` — twelve real page
  texts, a real `styleBible`, palette `#f4efe4 #c9a227 #7d8c73 #4a5a6a #b4553c`,
  motif "hand-inked botanical margins", three-movement arc, through-line "the
  rope crew". This is the only real content and it is genuinely good copy.
- Real measured cost figure: 172.80 neurons per plate, from the `cf-ai-neurons`
  response header.
- **No plate images are checked in.** `public/` holds only Next.js scaffold
  SVGs. Any illustration on a marketing surface must be honestly generated in
  the fixture's declared style and never presented as a real model output.
- No users, no testimonials, no press, no benchmarks, no pricing. None may be
  invented.

## Product Principles

1. **The artwork is the only warm thing.** Chrome recedes; the plate leads.
2. **A book, not a feed.** Sequence, arc, and through-line are the product;
   anything that reads as an infographic or a slide deck has failed.
3. **Show the derivation.** Every consequence names what caused it. The chain
   is not decoration.
4. **Scarcity is stated, not hidden.** Free tiers, real quotas, honest halts.
5. **Local and disposable.** No account, nothing uploaded, nothing tracked —
   and worlds live only in this browser.

## Accessibility & Inclusion

- The reader is keyboard-driven by design (arrow keys); keyboard access is a
  product feature, not an afterthought.
- `prefers-reduced-motion` is already honoured globally in `app/globals.css`
  and any new motion must respect it.
- Every plate carries `altText` from the model; text never waits on artwork.
