'use client';

import { DOMAIN_COLOUR } from '@/lib/domain';
import type { Spread } from './spreads';

interface Props {
  spreads: Spread[];
  current: number;
  onSelect: (index: number) => void;
}

/**
 * The spine. Every plate in the book as one bar in its effect's domain colour,
 * filled when the artwork exists and hollow while it does not. A gap marks each
 * chapter boundary — the reasoning spread used to do that job, and no longer
 * sits in the reading order.
 *
 * It is navigation, but it is also the honest status display — you can see at a
 * glance how much of a chapter actually rendered.
 */
export default function IndexRail({ spreads, current, onSelect }: Props) {
  return (
    <nav aria-label="Book index" className="flex items-end gap-[3px]">
      {spreads.map((spread, index) => {
        const active = index === current;
        const newChapter = index > 0 && spreads[index - 1].chapter.id !== spread.chapter.id;
        const colour = spread.effect ? DOMAIN_COLOUR[spread.effect.domain] : 'var(--dimmer)';
        const rendered = spread.image?.status === 'ready';
        const refused = spread.image?.status === 'refused';

        return (
          <button
            key={spread.key}
            type="button"
            onClick={() => onSelect(index)}
            aria-label={`Chapter ${spread.chapter.number}, plate ${spread.page.index}`}
            aria-current={active ? 'true' : undefined}
            title={`Ch.${spread.chapter.number} plate ${spread.page.index}${spread.effect ? ` — ${spread.effect.domain}` : ''}`}
            className={`flex h-7 w-[7px] items-end ${newChapter ? 'ml-3' : ''}`}
          >
            <span
              className="block w-full transition-all"
              style={{
                height: active ? '26px' : rendered ? '16px' : '9px',
                background: refused ? 'transparent' : colour,
                opacity: rendered || active ? 1 : 0.4,
                border: refused ? `1px dashed ${colour}` : undefined,
              }}
            />
          </button>
        );
      })}
    </nav>
  );
}
