'use client';

import type { HaltReason } from '@/lib/imageQueue';
import { formatDuration, quotaWindow } from '@/lib/quota';
import { NEURONS_PER_PLATE } from '@/lib/types';

interface Props {
  total: number;
  ready: number;
  refused: number;
  pending: number;
  neurons: number;
  phase: 'idle' | 'rendering' | 'halted';
  halt: HaltReason | null;
  haltedAt?: number;
  hasArtwork: boolean;
  onRender: () => void;
  onDemo: () => void;
  onClearArtwork: () => void;
}

const number = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });

export default function RenderBar(props: Props) {
  const { total, ready, refused, pending, neurons, phase, halt, haltedAt } = props;

  if (phase === 'rendering') {
    const done = ready + refused;
    return (
      <Strip>
        <div className="flex flex-1 items-center gap-4">
          <p className="mono text-[var(--accent)]">drawing {done} of {total}</p>
          <div className="h-[3px] flex-1 bg-[var(--hair)]">
            <div
              className="h-full bg-[var(--accent)] transition-[width] duration-500"
              style={{ width: `${(done / Math.max(total, 1)) * 100}%` }}
            />
          </div>
          <p className="mono text-[var(--dimmer)]">{number.format(neurons)} neurons</p>
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
        <p className="mono text-[var(--dim)]">
          {pending} plate{pending === 1 ? '' : 's'} to draw
        </p>
        <div className="flex items-center gap-3">
          {/* The cost rides on the button rather than beside it: the number that
              matters is the one under the cursor at the moment of committing. */}
          <button
            type="button"
            onClick={props.onRender}
            className="mono border border-[var(--hair-bright)] px-3 py-1.5 text-[var(--text)] transition-colors hover:bg-[var(--raised)]"
          >
            draw the plates · ≈{number.format(pending * NEURONS_PER_PLATE)} neurons
          </button>
          <button
            type="button"
            onClick={props.onDemo}
            className="mono text-[var(--dimmer)] transition-colors hover:text-[var(--text)]"
            title="Placeholder artwork. Costs nothing."
          >
            demo artwork
          </button>
        </div>
      </Strip>
    );
  }

  return (
    <Strip>
      <p className="mono text-[var(--dimmer)]">
        {ready} plate{ready === 1 ? '' : 's'} drawn
        {refused > 0 && ` · ${refused} withheld`}
        {neurons > 0 && ` · ${number.format(neurons)} neurons`}
      </p>
      {props.hasArtwork && (
        <button
          type="button"
          onClick={props.onClearArtwork}
          className="mono text-[var(--dimmer)] transition-colors hover:text-[var(--text)]"
        >
          clear artwork
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
        <p className="mono text-[#e8b75d]">
          image quota gone · {ready} of {total} drawn
        </p>
        <div className="flex items-center gap-3">
          {window?.ready ? (
            <button
              type="button"
              onClick={onRender}
              className="mono border border-[#e8b75d] px-3 py-1.5 text-[#e8b75d] transition-colors hover:bg-[#e8b75d] hover:text-[var(--ink)]"
            >
              resume — the day has turned
            </button>
          ) : (
            <p className="mono text-[var(--dim)]">
              returns at 00:00 UTC{window ? `, in ${formatDuration(window.msRemaining)}` : ''}
            </p>
          )}
        </div>
      </Strip>
    );
  }

  return (
    <Strip tone="alert">
      <p className="mono text-[#d96a5b]">
        {halt.kind === 'config'
          ? 'not configured'
          : // Named apart from a generic stop: this one says the fault is the
            // same for every remaining plate, so retrying without a change will
            // fail identically.
            halt.kind === 'systemic'
            ? 'drawing stopped — same fault on every plate'
            : 'drawing stopped'}{' '}
        · {ready} of {total} drawn
      </p>
      <div className="flex items-center gap-3">
        <p className="hidden max-w-md truncate text-sm text-[var(--dimmer)] sm:block">{halt.message}</p>
        {halt.kind !== 'config' && (
          <button
            type="button"
            onClick={onRender}
            className="mono border border-[var(--hair-bright)] px-3 py-1.5 text-[var(--text)] transition-colors hover:bg-[var(--raised)]"
          >
            try again
          </button>
        )}
      </div>
    </Strip>
  );
}

function Strip({ children, tone }: { children: React.ReactNode; tone?: 'alert' }) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b px-4 py-2.5 sm:px-6 ${
        tone === 'alert' ? 'border-[#e8b75d]/30 bg-[#e8b75d]/5' : 'border-[var(--hair)]'
      }`}
    >
      {children}
    </div>
  );
}
