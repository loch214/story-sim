'use client';

import type { HaltReason } from '@/lib/imageQueue';
import { formatDuration, formatLocalTime, quotaWindow } from '@/lib/quota';

interface Props {
  total: number;
  ready: number;
  refused: number;
  pending: number;
  phase: 'idle' | 'rendering' | 'halted';
  halt: HaltReason | null;
  haltedAt?: number;
  hasArtwork: boolean;
  /**
   * Offer free placeholder pictures. Only for the example book, whose pages
   * arrive without artwork — on a reader's own book it would look like their
   * real pictures had been swapped for noise.
   */
  offerSamples: boolean;
  /** Development tooling (clearing artwork to redraw). Never shown in production. */
  devTools: boolean;
  onRender: () => void;
  onDemo: () => void;
  onClearArtwork: () => void;
}

/**
 * One line of status above the page, said in words a reader uses: pictures and
 * pages, not plates and neurons. When every picture is drawn there is nothing
 * to say, so it says nothing.
 */
export default function RenderBar(props: Props) {
  const { total, ready, refused, pending, phase, halt, haltedAt } = props;

  if (phase === 'rendering') {
    const done = ready + refused;
    return (
      <Strip>
        <div className="flex flex-1 items-center gap-4" role="status">
          <p className="text-[0.98rem] text-[var(--text)]">
            Drawing the pictures… <span className="tabular-nums text-[var(--dim)]">{done} of {total}</span>
          </p>
          <div className="h-1.5 min-w-24 flex-1 overflow-hidden rounded-full bg-[var(--hair)]">
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500"
              style={{ width: `${(done / Math.max(total, 1)) * 100}%` }}
            />
          </div>
          <p className="hidden text-[0.95rem] text-[var(--dimmer)] sm:block">You can start reading now.</p>
        </div>
      </Strip>
    );
  }

  if (phase === 'halted' && halt) {
    return <HaltStrip halt={halt} haltedAt={haltedAt} ready={ready} total={total} onRender={props.onRender} />;
  }

  if (pending > 0) {
    return (
      <Strip>
        <p className="text-[0.98rem] text-[var(--dim)]">
          {pending === total
            ? 'This book has no pictures yet.'
            : `${pending} page${pending === 1 ? '' : 's'} still need${pending === 1 ? 's' : ''} a picture.`}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {props.offerSamples && (
            <button type="button" onClick={props.onDemo} className="btn">
              Show sample pictures (free)
            </button>
          )}
          {/* The cost rides with the button rather than in a footnote: this is
              the moment the shared allowance gets spent. */}
          <button
            type="button"
            onClick={props.onRender}
            className={props.offerSamples ? 'btn' : 'btn-primary'}
            title="Uses part of today’s shared free allowance."
          >
            Draw the pictures
          </button>
        </div>
      </Strip>
    );
  }

  if (refused === 0 && !props.devTools) return null;

  return (
    <Strip>
      <p className="text-[0.98rem] text-[var(--dimmer)]">
        {refused > 0
          ? `${refused} picture${refused === 1 ? '' : 's'} couldn’t be drawn. The rest of the book is fine.`
          : `All ${ready} pictures drawn.`}
      </p>
      {props.devTools && props.hasArtwork && (
        <button type="button" onClick={props.onClearArtwork} className="btn-quiet text-[0.9rem]">
          Clear artwork (dev)
        </button>
      )}
    </Strip>
  );
}

function HaltStrip({
  halt,
  haltedAt,
  ready,
  total,
  onRender,
}: {
  halt: HaltReason;
  haltedAt?: number;
  ready: number;
  total: number;
  onRender: () => void;
}) {
  if (halt.kind === 'quota') {
    const window = haltedAt ? quotaWindow(haltedAt) : null;
    return (
      <Strip tone="alert">
        <div>
          <p className="text-[1rem] text-[#f0c879]">
            Today’s free pictures have run out — {ready} of {total} are drawn.
          </p>
          {!window?.ready && (
            <p className="mt-0.5 text-[0.95rem] text-[var(--dim)]">
              Your book is saved. More pictures can be drawn
              {window
                ? ` after ${formatLocalTime(window.resetAt)} (in ${formatDuration(window.msRemaining)})`
                : ' tomorrow'}
              . You can still read every page.
            </p>
          )}
        </div>
        {window?.ready && (
          <button type="button" onClick={onRender} className="btn-primary">
            Finish drawing
          </button>
        )}
      </Strip>
    );
  }

  return (
    <Strip tone="alert">
      <div className="min-w-0">
        <p className="text-[1rem] text-[#f0a294]">
          {halt.kind === 'config'
            ? 'Pictures can’t be drawn — Story-sim isn’t set up for it yet.'
            : `Drawing stopped — ${ready} of ${total} pictures are done.`}
        </p>
        {/* Named apart from a generic stop: this one says the fault is the
            same for every remaining picture, so retrying without a change
            will fail identically. */}
        <p className="mt-0.5 text-[0.95rem] text-[var(--dim)]">
          {halt.kind === 'systemic'
            ? 'The problem is on our side, not with your story. Trying again may not help until it is fixed.'
            : halt.kind === 'config'
              ? 'Whoever runs this app needs to add its picture settings.'
              : 'Your book is saved. This is usually temporary.'}
        </p>
        {halt.message && (
          <details className="mt-1 text-[var(--dimmer)]">
            <summary className="cursor-pointer text-[0.9rem] hover:text-[var(--dim)]">Technical details</summary>
            <p className="mt-1 max-w-2xl text-[0.88rem] leading-relaxed">{halt.message}</p>
          </details>
        )}
      </div>
      {halt.kind !== 'config' && (
        <button type="button" onClick={onRender} className="btn">
          Try again
        </button>
      )}
    </Strip>
  );
}

function Strip({ children, tone }: { children: React.ReactNode; tone?: 'alert' }) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b px-4 py-3 sm:px-6 ${
        tone === 'alert' ? 'border-[#e8b75d]/30 bg-[#e8b75d]/5' : 'border-[var(--hair)]'
      }`}
    >
      {children}
    </div>
  );
}
