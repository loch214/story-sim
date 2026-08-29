'use client';

import { useCallback, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  cubicBezier,
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from 'motion/react';

export interface LeafSpec {
  id: string;
  /** Mono label for the edge-stack and the page counter. Never an eyebrow. */
  tab: string;
  front: ReactNode;
  /** Seen for the half-second the sheet is edge-on. Quiet by design. */
  back: ReactNode;
}

/** Scroll consumed per leaf. Generous, because each leaf is read, not skimmed. */
const UNIT_VH = 132;

/** Where inside its unit a leaf dwells, turns, and has finished turning. */
const TURN_FROM = 0.32;
const TURN_TO = 0.95;

const swing = cubicBezier(0.66, 0.02, 0.32, 1);

const ROOMY = '(min-width: 900px) and (min-height: 620px)';

/**
 * The same markup serves both renderings. It ships as an ordinary vertical
 * document — which is what the server sends, what a phone keeps, and what a
 * reader who has asked for less motion keeps — and only becomes a book once the
 * client has confirmed there is room and appetite for one. Nothing is duplicated
 * and nothing is hidden from a screen reader either way.
 */
function useRoomForABook() {
  const subscribe = useCallback((notify: () => void) => {
    const query = window.matchMedia(ROOMY);
    query.addEventListener('change', notify);
    return () => query.removeEventListener('change', notify);
  }, []);
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(ROOMY).matches,
    () => false,
  );
}

export default function Book({ leaves }: { leaves: LeafSpec[] }) {
  const track = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  const bound = useRoomForABook() && !reduced;

  const { scrollYProgress } = useScroll({
    target: track,
    offset: ['start start', 'end end'],
  });

  const turns = leaves.length - 1;
  const unit = 1 / (turns + 1);
  // The counter has to agree with what a Leaf itself decides "turned" means —
  // its own TURN_TO boundary — rather than a second, independently-tuned
  // formula that can silently drift out of sync with the visuals.
  const turnedPast = Array.from({ length: turns }, (_, i) => (i + TURN_TO) * unit);
  const [open, setOpen] = useState(0);

  useMotionValueEvent(scrollYProgress, 'change', (p) => {
    const next = turnedPast.filter((threshold) => p > threshold).length;
    setOpen((current) => (current === next ? current : next));
  });

  if (!bound) {
    return (
      <div className="mx-auto w-full max-w-3xl px-5 pb-24 sm:px-8">
        {leaves.map((leaf, i) => (
          <section
            key={leaf.id}
            id={leaf.id}
            aria-label={leaf.tab}
            className="leaf-face settle relative mb-10 overflow-hidden rounded-[3px] px-6 py-10 sm:px-10 sm:py-14"
          >
            <span className="mono absolute right-5 top-5 text-[var(--dimmer)]">
              {String(i + 1).padStart(2, '0')}
            </span>
            {leaf.front}
          </section>
        ))}
      </div>
    );
  }

  return (
    <div ref={track} style={{ height: `${(turns + 1) * UNIT_VH}vh` }} className="relative">
      <div className="sticky top-0 flex h-dvh items-center overflow-hidden">
        {/* The desk the book lies on: a pool of lamplight, off-centre so the
            turned sheet has somewhere dark to go. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(120% 92% at 62% 42%, #16202400 0%, #0d1214 78%), radial-gradient(58% 46% at 58% 40%, rgba(201,162,39,0.07), transparent 70%)',
          }}
        />

        <div
          className="relative ml-[7vw] mr-[4vw] w-full max-w-[1180px]"
          style={{
            height: 'min(84vh, 880px)',
            perspective: '2400px',
            perspectiveOrigin: '32% 48%',
          }}
        >
          <ReadPile progress={scrollYProgress} turns={turns} />

          <div className="absolute inset-y-0 left-[46px] right-0" style={{ transformStyle: 'preserve-3d' }}>
            <EdgeStack progress={scrollYProgress} turns={turns} />

            {leaves.map((leaf, i) => (
              <Leaf
                key={leaf.id}
                leaf={leaf}
                index={i}
                total={leaves.length}
                turns={turns}
                progress={scrollYProgress}
                active={open === i}
                pastTurn={i < open}
              />
            ))}
          </div>
        </div>

        <Counter open={open} total={leaves.length} tab={leaves[open]?.tab ?? ''} />
        <TopAction progress={scrollYProgress} unit={unit} />
      </div>
    </div>
  );
}

/**
 * The cover carries the action at full size. Once the cover has turned it moves
 * up here so it is never more than a glance away, and never competes with it.
 */
function TopAction({ progress, unit }: { progress: MotionValue<number>; unit: number }) {
  // Tied to the cover's own turn window rather than a fixed guess, so it stays
  // correct if the number of leaves — and so the unit each occupies — changes.
  const from = TURN_FROM * unit;
  const to = TURN_TO * unit;
  const opacity = useTransform(progress, [from, to], [0, 1], { clamp: true });
  const y = useTransform(progress, [from, to], [-12, 0], { clamp: true });
  const pointerEvents = useTransform(opacity, (value) => (value > 0.5 ? 'auto' : 'none'));
  return (
    <motion.div style={{ opacity, y, pointerEvents }} className="absolute right-[4vw] top-7 z-40">
      <a
        href="/library"
        className="mono border border-[var(--hair-bright)] px-4 py-2.5 text-[var(--dim)] transition-colors hover:border-[var(--lf-ochre)] hover:text-[var(--text)]"
      >
        open the atlas
      </a>
    </motion.div>
  );
}

/* ── one sheet ──────────────────────────────────────────────────────────── */

function Leaf({
  leaf,
  index,
  total,
  turns,
  progress,
  active,
  pastTurn,
}: {
  leaf: LeafSpec;
  index: number;
  total: number;
  turns: number;
  progress: MotionValue<number>;
  active: boolean;
  pastTurn: boolean;
}) {
  const unit = 1 / (turns + 1);
  const from = (index + TURN_FROM) * unit;
  const to = (index + TURN_TO) * unit;
  const span = to - from;

  // Every leaf gets its own resting depth. Without this, every leaf that has
  // not yet started turning sits at the same z (its clamped pre-turn value),
  // which makes them perfectly coplanar inside this preserve-3d context —
  // coplanar quads have no defined paint order in WebKit/Blink's true 3D
  // compositor, so z-index alone cannot be trusted to keep the active leaf on
  // top; a later leaf can flicker through the current one. REST_Z gives each
  // leaf a distinct shelf (earlier leaves nearer the camera), and the lift
  // during its own turn is layered on top of that shelf, never replacing it.
  const REST_Z = -index * 6;

  // Its own turn.
  const rotateY = useTransform(progress, [from, to], [0, -172], { ease: swing, clamp: true });
  const z = useTransform(progress, [from, from + span / 2, to], [REST_Z, REST_Z + 110, REST_Z + 24], {
    clamp: true,
  });
  const x = useTransform(progress, [from, from + span / 2, to], [0, 26, 0], { clamp: true });
  const opacity = useTransform(progress, [to - span * 0.26, to], [1, 0], { clamp: true });

  // The light that crosses the sheet as it swings past the lamp.
  const rake = useTransform(progress, [from, from + span * 0.55, to], [0, 0.95, 0.3], { clamp: true });
  const rakeShift = useTransform(progress, [from, to], ['-46%', '52%'], { clamp: true });

  // Its reveal, which is the previous sheet's turn.
  const revealFrom = (index - 1 + TURN_FROM) * unit;
  const revealTo = (index - 1 + TURN_TO) * unit;
  const shade = useTransform(progress, [revealFrom, revealTo], [0.82, 0], { clamp: true });
  const contentY = useTransform(progress, [revealFrom + (revealTo - revealFrom) * 0.4, revealTo], [30, 0], {
    clamp: true,
  });
  const contentOpacity = useTransform(
    progress,
    [revealFrom + (revealTo - revealFrom) * 0.35, revealTo],
    [0, 1],
    { clamp: true },
  );

  const first = index === 0;
  const last = index === total - 1;

  return (
    <motion.article
      id={leaf.id}
      aria-label={leaf.tab}
      // Only the sheet on top takes the pointer or the tab key, so focus order
      // matches what is actually facing the reader.
      inert={!active}
      style={{
        rotateY: last ? 0 : rotateY,
        z: last ? REST_Z : z,
        x: last ? 0 : x,
        // Once `open` has moved past this leaf, its own turn is unambiguously
        // finished — hard-zero with a plain number rather than trusting the
        // continuous motion value: Framer drives scroll-linked transforms via
        // WAAPI directly on the node, and the interpolated value can settle a
        // few percent short of its clamped endpoint, leaving a faint sliver of
        // an old leaf visible at the spine long after it should be gone.
        opacity: last ? 1 : pastTurn ? 0 : opacity,
        zIndex: total - index,
        transformOrigin: 'left center',
        transformStyle: 'preserve-3d',
      }}
      className="absolute inset-0"
    >
      {/* front */}
      <div
        className="leaf-face grain absolute inset-0 overflow-hidden rounded-r-[4px] rounded-l-[2px]"
        style={{ backfaceVisibility: 'hidden' }}
      >
        {/* Once this leaf is `active` (the one currently being read), its reveal
            is unambiguously finished — bypass the continuous contentOpacity /
            shade motion values rather than trust them to have settled exactly
            at 1 / 0. Same WAAPI-precision issue as the article's own opacity
            above: the natural value gets close but not always exactly there,
            which read as a permanently under-lit final leaf.

            Critically, this swaps the *value* at each style key (a plain
            number vs. the MotionValue) rather than swapping the whole `style`
            object between `undefined` and `{...}`. Framer Motion applies
            MotionValues via direct, imperative DOM mutation outside React's
            own diffing; dropping a key from the style object on a later
            render doesn't reliably clear whatever value it last wrote, so the
            leaf stayed permanently stuck at opacity 0. Keeping the key always
            present, and only ever swapping what's assigned to it, gives every
            render something concrete to apply. */}
        <motion.div
          style={{ y: first || active || pastTurn ? 0 : contentY, opacity: first || active || pastTurn ? 1 : contentOpacity }}
          className={`relative z-10 flex h-full flex-col ${first ? 'settle' : ''}`}
        >
          {leaf.front}
        </motion.div>

        {/* The sheet above has not lifted yet, so this one is still in shadow. */}
        {!first && (
          <motion.div
            aria-hidden
            style={{ opacity: active || pastTurn ? 0 : shade }}
            className="pointer-events-none absolute inset-0 z-20 bg-[#05090a]"
          />
        )}

        {/* Raking light. */}
        {!last && (
          <motion.div
            aria-hidden
            style={{ opacity: rake, x: rakeShift }}
            className="leaf-rake pointer-events-none absolute -inset-x-1/2 inset-y-0 z-30"
          />
        )}

        {/* The spine edge: where the sheet is bound, and where it bends. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-14 z-30"
          style={{
            background:
              'linear-gradient(90deg, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.3) 32%, rgba(255,255,255,0.045) 74%, rgba(0,0,0,0) 100%)',
          }}
        />
      </div>

      {/* back — vellum, and the citation for the leaf just read */}
      <div
        className="leaf-back absolute inset-0 overflow-hidden rounded-l-[4px]"
        style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
      >
        {leaf.back}
      </div>
    </motion.article>
  );
}

/* ── the two progress objects, both physical ────────────────────────────── */

/** Sheets already turned, stacked at the spine. It thickens as you read. */
function ReadPile({ progress, turns }: { progress: MotionValue<number>; turns: number }) {
  return (
    <div aria-hidden className="absolute inset-y-6 left-0 w-[46px]">
      {Array.from({ length: turns }, (_, i) => (
        <PileSheet key={i} index={i} progress={progress} turns={turns} />
      ))}
    </div>
  );
}

function PileSheet({ progress, index, turns }: { progress: MotionValue<number>; index: number; turns: number }) {
  const unit = 1 / (turns + 1);
  const landed = (index + TURN_TO) * unit;
  const opacity = useTransform(progress, [landed - unit * 0.2, landed], [0, 1], { clamp: true });
  const width = useTransform(progress, [landed - unit * 0.2, landed], [0, 1], { clamp: true });
  return (
    <motion.div
      style={{ opacity, scaleX: width, right: index * 3.2, transformOrigin: 'right center' }}
      className="absolute inset-y-0 w-[2px] rounded-l-[1px] bg-[var(--vellum)]"
    />
  );
}

/** Sheets not yet turned, seen edge-on at the fore-edge. It thins as you read. */
function EdgeStack({ progress, turns }: { progress: MotionValue<number>; turns: number }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-y-5 right-[-13px] z-0 w-[13px]">
      {Array.from({ length: turns }, (_, i) => (
        <EdgeSheet key={i} index={i} progress={progress} turns={turns} />
      ))}
    </div>
  );
}

function EdgeSheet({ progress, index, turns }: { progress: MotionValue<number>; index: number; turns: number }) {
  const unit = 1 / (turns + 1);
  const gone = (index + TURN_FROM) * unit;
  const opacity = useTransform(progress, [gone, gone + unit * 0.16], [1, 0], { clamp: true });
  return (
    <motion.div
      style={{ opacity, left: index * 2 }}
      className="absolute inset-y-0 w-[1.5px] bg-[#4c5b60]"
    />
  );
}

/** Where you are in the book, in the app's own taxonomy face. */
function Counter({ open, total, tab }: { open: number; total: number; tab: string }) {
  return (
    <div className="pointer-events-none absolute bottom-7 left-[7vw] z-40 flex items-baseline gap-4">
      <span className="mono text-[var(--dim)]">
        {String(open + 1).padStart(2, '0')} <span className="text-[var(--dimmer)]">/ {String(total).padStart(2, '0')}</span>
      </span>
      <span className="mono text-[var(--dimmer)]">{tab}</span>
      {open === 0 && (
        <span className="mono animate-pulse text-[var(--dimmer)]">scroll to turn</span>
      )}
    </div>
  );
}
