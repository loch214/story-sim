'use client';

import { useEffect, useMemo } from 'react';
import { DOMAIN_COLOUR, ORDER_LABEL } from '@/lib/domain';
import { PAGES_PER_CHAPTER, type Effect, type Page, type StoredImage } from '@/lib/types';

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
 * Text never waits on artwork. All twelve pages exist the moment phase 1
 * returns, so a missing image is a state to render, not a reason to block.
 */
export default function PlatePage({ page, effect, image, onOpenChain }: Props) {
  const blob = image?.blob ?? null;
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);

  useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);

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

        <p className="mono absolute left-3 top-3 text-[var(--text)] mix-blend-difference">
          plate {String(page.index).padStart(2, '0')} / {PAGES_PER_CHAPTER}
        </p>

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

      {effect && (
        <div
          className="mt-3 flex w-full items-center justify-between gap-3 px-1"
          style={{ maxWidth: 'var(--plate-max)' }}
        >
          <button
            type="button"
            onClick={() => onOpenChain(effect.id)}
            className="mono group flex items-center gap-2 text-[var(--dim)] transition-colors hover:text-[var(--text)]"
          >
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: DOMAIN_COLOUR[effect.domain] }}
            />
            <span className="border-b border-transparent group-hover:border-[var(--hair-bright)]">
              {ORDER_LABEL[effect.order]} · {effect.domain}
            </span>
          </button>
          <span className="mono text-[var(--dimmer)]">{page.shotType}</span>
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
        <p className="mono text-[var(--dim)]">plate withheld</p>
        <p className="max-w-xs text-sm leading-relaxed text-[var(--dimmer)]">
          The image service refused this prompt. The rest of the chapter is unaffected.
        </p>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="mono text-[var(--dim)]">plate failed</p>
        <p className="max-w-xs text-sm leading-relaxed text-[var(--dimmer)]">
          Generation stopped before this plate was made. Resume from the library when quota returns.
        </p>
      </div>
    );
  }

  return (
    <div className="pending-shimmer flex h-full w-full items-end justify-start p-5">
      <p className="mono text-[var(--dimmer)]">
        {status === 'generating' ? 'drawing' : 'awaiting plate'}
      </p>
    </div>
  );
}
