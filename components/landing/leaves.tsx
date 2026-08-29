import Link from 'next/link';
import { DOMAIN_COLOUR } from '@/lib/domain';
import type { LeafSpec } from './Book';
import { PLATES } from './plates';

/* ── shared parts, all in the app's own vocabulary ──────────────────────── */

function Sheet({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`flex h-full flex-col px-[7.5%] py-[6.5%] ${className}`}>{children}</div>;
}

function Head({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="leaf-title text-[clamp(2rem,3.5vw,3.5rem)]">{children}</h2>
  );
}

function Body({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <p className={`leaf-prose ${className}`}>{children}</p>;
}

/** The primary action. The only saturated fill on the whole page. */
function Open({ children = 'Open the atlas' }: { children?: React.ReactNode }) {
  return (
    <Link
      href="/library"
      className="mono inline-flex items-center gap-3 bg-[var(--lf-ochre)] px-6 py-3.5 text-[#181307] transition-[background-color,transform] duration-200 hover:bg-[#dcb436] active:translate-y-px"
    >
      {children}
      <span aria-hidden className="text-[1.1em] leading-none">→</span>
    </Link>
  );
}

function ReadFixture() {
  return (
    <Link
      href="/library?read=long-fall"
      className="mono text-[var(--dim)] underline decoration-[var(--hair-bright)] decoration-1 underline-offset-[6px] transition-colors hover:text-[var(--text)] hover:decoration-[var(--lf-ochre)]"
    >
      read the long fall — free, no quota
    </Link>
  );
}

/** Says out loud what the artwork is. Nothing here pretends to be model output. */
function Provenance({ className = '' }: { className?: string }) {
  return (
    <p className={`mono leading-[1.7] text-[var(--dimmer)] ${className}`}>
      plates on this page are drawn to the chapter’s style bible, not generated from it.
      <br />
      the page text is verbatim from the checked-in fixture chapter.
    </p>
  );
}

/** The vellum reverse of a sheet. Read only while the leaf is edge-on. */
function Back({ note, cite }: { note: string; cite: string }) {
  return (
    <div className="flex h-full flex-col justify-between px-[7.5%] py-[6.5%] text-[var(--vellum-ink)]">
      <p className="mono text-[#6c6355]">{cite}</p>
      <p className="max-w-[30ch] self-end text-right text-[1.5rem] italic leading-[1.35] text-[#3a352b]">
        {note}
      </p>
      <div aria-hidden className="flex items-end gap-[3px] opacity-30">
        {[14, 26, 9, 34, 18, 22, 11].map((h, i) => (
          <span key={i} className="w-[3px] bg-[#3a352b]" style={{ height: h }} />
        ))}
      </div>
    </div>
  );
}

/* ── 1 · the cover ──────────────────────────────────────────────────────── */

function Cover() {
  const plate = PLATES[0];
  return (
    <div className="flex h-full flex-col">
      <header className="px-[7.5%] pb-[2.5%] pt-[4.5%]">
        <h1 className="leaf-title text-[clamp(2.4rem,4.6vw,4.4rem)]">Story‑sim</h1>
        <p className="mt-3 max-w-[42ch] text-[clamp(1rem,1.15vw,1.2rem)] leading-[1.5] text-[var(--dim)]">
          Change one rule of reality. Read the world that results.
        </p>
      </header>

      {/* The plate is a true square, the same physical object the reader reads —
          not a wide crop of one. A book leaf is portrait-ish, so the plate is
          sized to the leaf's width and simply runs as tall as that makes it;
          the quiet margin above and below is the leaf's own paper, not empty
          canvas standing in for content. */}
      <div className="min-h-0 flex-1 px-[7.5%] pb-[4.5%]">
        <figure className="relative mx-auto h-full max-w-full overflow-hidden border border-[#2a373c]" style={{ aspectRatio: '1 / 1' }}>
          <plate.Scene />
          <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#080c0dfa] via-[#080c0de6] via-40% to-transparent px-[6%] pb-5 pt-16">
            <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="mono text-[var(--lf-ochre)]">rule</span>
              <span className="text-[clamp(0.95rem,1.1vw,1.2rem)] text-[#f3f0ea]">gravity is half as strong</span>
              <span aria-hidden className="mono text-[var(--dimmer)]">→</span>
              <span className="display text-[clamp(1rem,1.2vw,1.3rem)] text-[#f3f0ea]">The Long Fall</span>
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-x-7 gap-y-3">
              <Open />
              <ReadFixture />
            </div>
          </figcaption>
        </figure>
      </div>
    </div>
  );
}

/* ── 2 · the rule ───────────────────────────────────────────────────────── */

const PREMISES = [
  { text: 'gravity is half as strong', mode: 'rule' },
  { text: 'a world where nobody can lie', mode: 'rule' },
  { text: 'the last tram driver in a city that stopped needing trams', mode: 'story' },
  { text: 'photosynthesis works at night', mode: 'rule' },
];

function TheRule() {
  return (
    <Sheet>
      <Head>You give it one line.</Head>
      <Body className="mt-6">
        A rule, and the app derives what follows from it. Or somebody’s afternoon, and it tells
        that forward instead. Two pipelines, one contract — a story run through the rule
        pipeline comes back as twelve pages of transport policy, so the app decides which it is
        before it spends anything.
      </Body>

      <div className="mt-auto pt-8">
        <ul className="border-t border-[#26343a]">
          {PREMISES.map((premise, i) => (
            <li
              key={premise.text}
              className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-[#26343a] py-4"
            >
              <span
                className={`text-[clamp(1.05rem,1.5vw,1.55rem)] leading-tight ${
                  i === 0 ? 'text-[var(--text)]' : 'text-[#7c8b91]'
                }`}
              >
                {premise.text}
                {i === 0 && (
                  <span aria-hidden className="ml-1 inline-block h-[1.05em] w-[2px] translate-y-[0.14em] animate-pulse bg-[var(--lf-ochre)]" />
                )}
              </span>
              <span className="mono text-[var(--dimmer)]">{premise.mode}</span>
            </li>
          ))}
        </ul>
        <p className="mono mt-5 max-w-[52ch] leading-[1.8] text-[var(--dimmer)]">
          pre‑flight restates what it thinks you meant. confirming that restatement is the only
          confirmation there is — it writes the chapter and draws the plates in one action.
        </p>
      </div>
    </Sheet>
  );
}

/* ── 3 · the derivation ─────────────────────────────────────────────────── */

interface ChainNode {
  id: string;
  domain: keyof typeof DOMAIN_COLOUR;
  x: number;
  y: number;
  lines: string[];
  plate: string;
  from?: string[];
}

const NODES: ChainNode[] = [
  { id: 'e1', domain: 'environment', x: 262, y: 18, plate: '01', lines: ['Dust and pollen no', 'longer settle. A', 'permanent pale haze.'] },
  { id: 'e2', domain: 'science', x: 262, y: 176, plate: '04', lines: ['Escape velocity halves.', 'Orbit becomes an', 'ordinary freight problem.'] },
  { id: 'e4', domain: 'technology', x: 262, y: 334, plate: '03', lines: ['Structures carry their', 'own weight further.', 'Buildings grow thinner.'] },
  { id: 'e7', domain: 'environment', x: 578, y: 18, plate: '10', from: ['e1'], lines: ['The haze cools the', 'surface by a degree.', 'Seasons shift poleward.'] },
  { id: 'e5', domain: 'economy', x: 578, y: 176, plate: '06', from: ['e2'], lines: ['Orbital freight undercuts', 'shipping. Deepwater ports', 'lose their traffic.'] },
  { id: 'e8', domain: 'politics', x: 578, y: 334, plate: '07', from: ['e4'], lines: ['Building codes invert.', 'Ground‑level footprint', 'becomes the scarce thing.'] },
  { id: 'e12', domain: 'economy', x: 894, y: 18, plate: '11', from: ['e7'], lines: ['Agriculture migrates', 'poleward; grain moves', 'by low sky‑barge.'] },
  { id: 'e9', domain: 'conflict', x: 894, y: 176, plate: '12', from: ['e5'], lines: ['Launch corridors become', 'chokepoints. Fleets sit', 'around empty fields.'] },
  { id: 'e10', domain: 'politics', x: 894, y: 334, plate: '08', from: ['e8'], lines: ['Ground becomes the', 'elite address. Walled', 'gardens at street level.'] },
];

const NODE_W = 232;
const NODE_H = 122;

function ChainPlate() {
  const at = (id: string) => NODES.find((n) => n.id === id)!;
  return (
    <svg viewBox="0 0 1160 476" className="h-full w-full" role="img" aria-label="The causal chain derived from the rule: gravity is half as strong. Three orders of consequence fan out from the rule, each node citing what caused it and the plate that dramatises it.">
      <rect width={1160} height={476} fill="#ebe5d7" />

      {/* order rails */}
      {[
        [262, 'order 1'],
        [578, 'order 2'],
        [894, 'order 3'],
      ].map(([x, label]) => (
        <g key={label as string}>
          <line x1={x as number} y1={8} x2={x as number} y2={468} stroke="#c3bba6" strokeWidth={1} />
          <text x={(x as number) + 8} y={466} fill="#8d846f" fontSize={13} letterSpacing={1.6} className="svg-mono">
            {(label as string).toUpperCase()}
          </text>
        </g>
      ))}

      {/* the rule */}
      <rect x={18} y={176} width={200} height={NODE_H} fill="#2b2820" />
      <text x={34} y={206} fill="#c9a227" fontSize={13} letterSpacing={1.8} className="svg-mono">
        RULE
      </text>
      <text x={34} y={238} fill="#efe9db" fontSize={19} className="svg-body">
        gravity is half
      </text>
      <text x={34} y={262} fill="#efe9db" fontSize={19} className="svg-body">
        as strong
      </text>

      {/* connectors, drawn before the nodes so they tuck underneath */}
      {NODES.map((node) => {
        const sources = node.from ? node.from.map(at) : [];
        const x2 = node.x;
        const y2 = node.y + NODE_H / 2;
        if (sources.length === 0) {
          return (
            <path
              key={`c-${node.id}`}
              d={`M218 ${236} C 238 ${236}, 234 ${y2}, ${x2 - 2} ${y2}`}
              fill="none"
              stroke="#b0a68e"
              strokeWidth={1.5}
            />
          );
        }
        return sources.map((source) => (
          <path
            key={`c-${node.id}-${source.id}`}
            d={`M${source.x + NODE_W} ${source.y + NODE_H / 2} C ${source.x + NODE_W + 44} ${
              source.y + NODE_H / 2
            }, ${x2 - 44} ${y2}, ${x2 - 2} ${y2}`}
            fill="none"
            stroke="#b0a68e"
            strokeWidth={1.5}
          />
        ));
      })}

      {NODES.map((node) => (
        <g key={node.id}>
          <rect x={node.x} y={node.y} width={NODE_W} height={NODE_H} fill="#f6f2e7" stroke="#cec5ad" strokeWidth={1} />
          <rect x={node.x} y={node.y} width={4} height={NODE_H} fill={DOMAIN_COLOUR[node.domain]} />
          <text x={node.x + 18} y={node.y + 25} fill="#8d846f" fontSize={12} letterSpacing={1.5} className="svg-mono">
            {node.domain.toUpperCase()}
          </text>
          {node.lines.map((line, i) => (
            <text
              key={i}
              x={node.x + 18}
              y={node.y + 51 + i * 21}
              fill="#2b2820"
              fontSize={16}
              className="svg-body"
            >
              {line}
            </text>
          ))}
          <text
            x={node.x + NODE_W - 18}
            y={node.y + NODE_H - 12}
            textAnchor="end"
            fill="#a2705a"
            fontSize={12}
            letterSpacing={1.4}
            className="svg-mono"
          >
            PLATE {node.plate}
          </text>
        </g>
      ))}
    </svg>
  );
}

function Derivation() {
  return (
    <Sheet>
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
        <Head>Nothing is asserted.</Head>
        <Body className="max-w-[44ch] flex-1 basis-[30ch]">
          Every consequence declares what caused it, and every page declares the consequence it
          dramatises. A chapter whose chain never touches the world’s canon is rejected before
          a single plate is drawn.
        </Body>
      </div>

      {/* Same pattern as the real reader's page-0 diagram (ChainDiagram.tsx):
          fixed SVG geometry doesn't shrink to fit a phone width without its
          labels going illegible, so narrow viewports get a horizontal
          scroller over full-size art rather than a squeezed miniature. */}
      <div className="mt-7 min-h-0 flex-1 overflow-x-auto overflow-y-hidden border border-[#3a4348]">
        <div className="h-full min-w-[720px]">
          <ChainPlate />
        </div>
      </div>

      <p className="mono mt-5 max-w-[64ch] leading-[1.8] text-[var(--dimmer)]">
        read the plate numbers, not the rows: the pages are selected from the chain and ordered for
        reading. the third‑order consequence at the bottom right is plate 08; the first‑order one
        above the rule is plate 01. a citation is not a running order.
      </p>
    </Sheet>
  );
}

/* ── 4 · twelve plates, one world ───────────────────────────────────────── */

function OneWorld() {
  return (
    <Sheet>
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
        <Head>Twelve pictures, one world.</Head>
        <Body className="max-w-[46ch] flex-1 basis-[30ch]">
          Each plate is generated on its own, by a model with no memory of the last one. What holds
          them together is a style bible written once in chapter one and handed to every plate
          afterwards, word for word, forever.
        </Body>
      </div>

      <ul className="mt-7 grid min-h-0 flex-1 grid-cols-3 grid-rows-4 gap-[7px] sm:grid-cols-4 sm:grid-rows-3 lg:grid-cols-6 lg:grid-rows-2">
        {PLATES.map((plate) => (
          <li
            key={plate.index}
            className="group relative overflow-hidden border border-[#2c383d] transition-transform duration-300 ease-out hover:z-10 hover:scale-[1.06]"
          >
            <plate.Scene />
            <span className="mono absolute left-1.5 top-1.5 text-[10px] text-[#f4efe4] mix-blend-difference">
              {String(plate.index).padStart(2, '0')}
            </span>
            <span className="sr-only">{plate.alt}</span>
          </li>
        ))}
      </ul>

      <blockquote className="mt-6 border-l-2 border-[var(--lf-ochre)] pl-5 text-[clamp(0.95rem,1.05vw,1.1rem)] italic leading-[1.6] text-[#9fb0b6]">
        Hand-inked 2D cartoon, flat matte colour, visible linework. Muted palette: chalk white, dust
        ochre, pale sage, slate blue, rust red. Thin-ribbed, impossibly tall architecture, open
        shafts, hanging gardens. Low industrial tech: rope, canvas, copper. Figures small,
        mid-distance. Soft hazed daylight.
        <footer className="mono mt-2 not-italic text-[var(--dimmer)]">
          styleBible · the long fall · frozen at chapter 1
        </footer>
      </blockquote>
    </Sheet>
  );
}

/* ── 5 · a book, not a survey ───────────────────────────────────────────── */

const ARC = [
  { label: 'the year the weight went', from: 1, to: 3 },
  { label: 'building for the new lightness', from: 4, to: 8 },
  { label: 'children of the light years', from: 9, to: 12 },
];

function ABook() {
  const plate = PLATES[4];
  return (
    <Sheet>
      <Head>Twelve facts in a row is not a book.</Head>

      <div className="mt-7 grid min-h-0 flex-1 grid-cols-1 gap-9 lg:grid-cols-[1.05fr_1fr]">
        <div className="flex flex-col justify-between">
          <Body>
            So the chapter has to declare an arc — two to five movements, chosen to fit the
            premise, checked to cover all twelve pages. And it has to declare a through‑line: one
            unnamed role, never a named character, whose word must actually appear on at least seven
            of the twelve. Declared but absent does not pass.
          </Body>

          <div className="mt-7">
            <ol className="flex overflow-hidden border border-[#2f3d42]">
              {ARC.map((movement, i) => (
                <li
                  key={movement.label}
                  className="flex-1 border-l border-[#2f3d42] px-4 py-3.5 first:border-l-0"
                  style={{ flexGrow: movement.to - movement.from + 1 }}
                >
                  <span className="mono block text-[var(--dimmer)]">
                    {String(movement.from).padStart(2, '0')}–{String(movement.to).padStart(2, '0')}
                  </span>
                  <span className="mt-1.5 block text-[0.98rem] leading-snug text-[#b9c6ca]">
                    {movement.label}
                  </span>
                  <span
                    aria-hidden
                    className="mt-3 block h-[3px]"
                    style={{ background: ['#7d8c73', '#c9a227', '#b4553c'][i] }}
                  />
                </li>
              ))}
            </ol>

            <p className="mono mt-5 leading-[1.8] text-[var(--dimmer)]">
              through‑line · <span className="text-[var(--text)]">the rope crew</span> · head noun{' '}
              <span className="text-[var(--lf-ochre)]">crew</span> · found on 8 of 12 pages
            </p>
          </div>
        </div>

        <figure className="flex min-h-0 flex-col">
          <div className="relative min-h-0 flex-1 overflow-hidden border border-[#2c383d]">
            <plate.Scene />
          </div>
          <figcaption className="mt-4 text-[clamp(1rem,1.15vw,1.2rem)] leading-[1.55] text-[#cdd6d8]">
            “{plate.text}”
            <span className="mono mt-2 block text-[var(--dimmer)]">page 05 · verbatim</span>
          </figcaption>
        </figure>
      </div>
    </Sheet>
  );
}

/* ── 6 · compounding ────────────────────────────────────────────────────── */

function Compounding() {
  return (
    <Sheet>
      <Head>Add a second rule to the same world.</Head>
      <Body className="mt-6">
        The new chapter is reasoned against everything the first one established, and it returns a
        complete replacement canon. The old one is discarded, never merged — which is why two
        rules interact instead of sitting next to each other in a list.
      </Body>

      <div className="mt-auto pt-9">
        <div className="grid gap-px overflow-hidden border border-[#2f3d42] bg-[#2f3d42] sm:grid-cols-[1fr_auto_1fr]">
          <div className="bg-[#141c1f] px-6 py-7">
            <p className="mono text-[var(--dimmer)]">chapter 1</p>
            <p className="mt-3 text-[clamp(1.1rem,1.4vw,1.5rem)] leading-tight text-[var(--text)]">
              gravity is half as strong
            </p>
            <p className="mono mt-4 leading-[1.8] text-[var(--dimmer)]">
              canon written · style bible frozen · palette fixed
            </p>
            <div aria-hidden className="mt-4 flex">
              {['#f4efe4', '#c9a227', '#7d8c73', '#4a5a6a', '#b4553c'].map((colour) => (
                <span key={colour} className="h-5 w-8" style={{ background: colour }} />
              ))}
            </div>
          </div>

          <div className="flex items-center justify-center bg-[#141c1f] px-6 py-4 sm:px-4">
            <span aria-hidden className="mono text-[var(--lf-ochre)]">
              +
            </span>
          </div>

          <div className="bg-[#141c1f] px-6 py-7">
            <p className="mono text-[var(--dimmer)]">chapter 2</p>
            <p className="mt-3 text-[clamp(1.1rem,1.4vw,1.5rem)] leading-tight text-[var(--text)]">
              nobody sleeps more than two hours
            </p>
            <p className="mono mt-4 leading-[1.8] text-[var(--dimmer)]">
              canon replaced · same style bible · same palette
            </p>
            <p className="mt-4 text-[0.98rem] italic leading-snug text-[#9fb0b6]">
              The night crew stopped being a shift and became most of the city — and the drop
              shafts never empty now.
            </p>
          </div>
        </div>
        <p className="mono mt-5 leading-[1.8] text-[var(--dimmer)]">
          chapter 2 above is illustrative, not a generated chapter.
        </p>
      </div>
    </Sheet>
  );
}

/* ── 7 · the close ──────────────────────────────────────────────────────── */

const FACTS = [
  {
    term: 'Free tiers only',
    detail:
      'Gemini reasons, Cloudflare Workers AI draws. No paid provider exists in the dependency tree, behind a flag, or commented out.',
  },
  {
    term: '172.80 neurons a plate',
    detail:
      'Measured from the response header, not the rate card. Twelve plates a chapter, one shared free allowance a day — about five chapters between everyone.',
  },
  {
    term: 'When it runs out, it stops',
    detail:
      'The pool halts, the banner says when the allowance resets, and every plate already drawn stays drawn.',
  },
  {
    term: 'It lives in your browser',
    detail:
      'IndexedDB, no account, no upload, nothing to sign into. Clear your browser data and the worlds go with it.',
  },
];

function Close() {
  return (
    <Sheet>
      <Head>What it costs, and where it lives.</Head>

      <dl className="mt-6 grid min-h-0 flex-1 content-start gap-x-12 gap-y-5 sm:grid-cols-2">
        {FACTS.map((fact) => (
          <div key={fact.term} className="border-t border-[#2f3d42] pt-3">
            <dt className="text-[clamp(1rem,1.15vw,1.2rem)] leading-tight text-[var(--text)]">
              {fact.term}
            </dt>
            <dd className="mt-1.5 max-w-[42ch] text-[0.92rem] leading-[1.55] text-[var(--dim)]">
              {fact.detail}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-auto flex flex-wrap items-end justify-between gap-x-10 gap-y-4 pt-5">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <Open>open the atlas</Open>
          <ReadFixture />
        </div>
        <Provenance className="text-right" />
      </div>
    </Sheet>
  );
}

/* ── the book ───────────────────────────────────────────────────────────── */

export const LEAVES: LeafSpec[] = [
  {
    id: 'cover',
    tab: 'cover',
    front: <Cover />,
    back: <Back cite="the long fall · chapter 1" note="One rule in. An illustrated atlas of the world that results, out." />,
  },
  {
    id: 'rule',
    tab: 'the rule',
    front: <TheRule />,
    back: <Back cite="pre-flight · mode" note="A story run through the rule pipeline comes back as twelve pages of transport policy." />,
  },
  {
    id: 'chain',
    tab: 'the chain',
    front: <Derivation />,
    back: <Back cite="page 0 · the diagram" note="Derivation is checkable, or it is decoration." />,
  },
  {
    id: 'plates',
    tab: 'the plates',
    front: <OneWorld />,
    back: <Back cite="styleBible · frozen" note="Twelve independent generations, one visual world. The bible is the only thing holding them." />,
  },
  {
    id: 'book',
    tab: 'the book',
    front: <ABook />,
    back: <Back cite="arc · through-line" note="Never a recurring named character. Naming someone promises a face that twelve generations cannot keep." />,
  },
  {
    id: 'compound',
    tab: 'compounding',
    front: <Compounding />,
    back: <Back cite="replacement canon" note="Discard the old. Never merge." />,
  },
  {
    id: 'close',
    tab: 'the colophon',
    front: <Close />,
    back: <Back cite="colophon" note="Worlds live only in this browser." />,
  },
];
