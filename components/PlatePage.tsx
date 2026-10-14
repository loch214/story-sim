'use client';

import { useEffect, useState } from 'react';
import { DOMAIN_COLOUR } from '@/lib/domain';
import type { Effect, Page, StoredImage } from '@/lib/types';

interface Props {
  page: Page;
  effect?: Effect;
  image?: StoredImage;
  onOpenChain: (effectId: string) => void;
}

/**
 * A plate: square artwork with the page text in a band across the lower third —
 * the region the composition clause reserves. On narrow screens the band moves
 * below the image rather than over it.
 *
 * Text never waits on artwork. Every page exists the moment phase 1
 * returns, so a missing image is a state to render, not a reason to block.
 */
export default function PlatePage({ page, effect, image, onOpenChain }: Props) {
  const blob = image?.blob ?? null;
  // Created and revoked by the same effect. A memoised URL revoked in an
  // effect cleanup broke in development: Strict Mode runs the cleanup once on
  // mount, the memo is not recomputed, and the picture showed its alt text.
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);

  const status = image?.status ?? 'pending';

  return (
    <article className="plate-enter flex w-full flex-col items-center">
      <div
        className="relative w-full overflow-hidden border border-[var(--hair)] bg-[var(--raised)]"
        style={{ maxWidth: 'var(--plate-max)', aspectRatio: '1 / 1' }}
      >
        {url ? (
          // Blob URL out of IndexedDB: next/image cannot optimise it, and routing
          // it through the optimiser would add cost for no benefit.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={page.altText} className="h-full w-full object-cover" />
        ) : (
          <PlateAbsence status={status} />
        )}

        {/* Desktop: the band sits over the quiet lower third.

            A three-stop Tailwind gradient ramped to transparent too fast, so the
            first line of a two-line paragraph sat over nearly bare image and
            washed out on bright plates. This ramp is longer and eased — near
            opaque behind the text, fading over the height above it — and the
            text carries its own shadow so it survives a pale sky or a snowfield
            even where the scrim is thin. */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 hidden pt-32 sm:block"
          style={{
            background:
              'linear-gradient(to top, rgba(0,0,0,0.94) 0%, rgba(0,0,0,0.90) 25%, rgba(0,0,0,0.76) 48%, rgba(0,0,0,0.50) 68%, rgba(0,0,0,0.22) 84%, rgba(0,0,0,0) 100%)',
          }}
        >
          <p
            className="px-5 pb-5 text-[0.98rem] leading-relaxed text-[#faf8f4] sm:px-6 sm:pb-6"
            style={{ textShadow: '0 1px 3px rgba(0,0,0,0.85), 0 0 12px rgba(0,0,0,0.5)' }}
          >
            {page.text}
          </p>
        </div>
      </div>

      {/* Mobile: the band moves below the image rather than over it. */}
      <p
        className="mt-4 w-full px-1 text-[1.02rem] leading-relaxed text-[var(--text)] sm:hidden"
        style={{ maxWidth: 'var(--plate-max)' }}
      >
        {page.text}
      </p>

      {/* The order/domain/shotType labels used to sit here on every plate —
          reading-order chrome that reinforced the deck feel. That taxonomy
          still lives in the chapter, the export and the diagram; here it is
          one plainly worded way back to the reasoning this page came from. */}
      {effect && (
        <div className="mt-2 flex w-full justify-start" style={{ maxWidth: 'var(--plate-max)' }}>
          <button
            type="button"
            onClick={() => onOpenChain(effect.id)}
            className="btn-quiet gap-2 text-[0.95rem] no-underline hover:underline"
          >
            <span
              aria-hidden
              className="block h-2 w-2 rounded-full"
              style={{ background: DOMAIN_COLOUR[effect.domain] }}
            />
            Why is the world like this?
          </button>
        </div>
      )}
    </article>
  );
}

function PlateAbsence({ status }: { status: StoredImage['status'] }) {
  if (status === 'refused') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[var(--raised)] p-8 text-center">
        <div
          aria-hidden
          className="h-16 w-16 border border-[var(--hair-bright)]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(45deg, var(--hair) 0 2px, transparent 2px 9px)',
          }}
        />
        <p className="text-[1.05rem] text-[var(--dim)]">No picture for this page</p>
        <p className="max-w-xs text-[0.95rem] leading-relaxed text-[var(--dimmer)]">
          The drawing service wouldn’t draw this one. The rest of the book is fine.
        </p>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-[1.05rem] text-[var(--dim)]">This picture isn’t drawn yet</p>
        <p className="max-w-xs text-[0.95rem] leading-relaxed text-[var(--dimmer)]">
          Drawing stopped before reaching this page. The bar at the top says when it can carry on.
        </p>
      </div>
    );
  }

  return (
    <div className="pending-shimmer flex h-full w-full items-start justify-start p-5">
      <p className="text-[0.98rem] text-[var(--dim)]">
        {status === 'generating' ? 'Drawing this picture…' : 'Picture not drawn yet'}
      </p>
    </div>
  );
}
