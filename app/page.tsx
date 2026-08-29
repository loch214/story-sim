import Link from 'next/link';
import Book from '@/components/landing/Book';
import { LEAVES } from '@/components/landing/leaves';

/**
 * The landing page. A server component throughout — it touches no IndexedDB and
 * has no state, so it renders as static HTML and the whole book is in the markup
 * before any JavaScript runs. `Book` upgrades that markup to a turning book on a
 * desktop viewport where motion is welcome, and leaves it alone everywhere else.
 *
 * The app itself lives at /library.
 */
export default function Landing() {
  return (
    <main className="relative">
      <Book leaves={LEAVES} />

      <footer className="border-t border-[var(--hair)] px-[7vw] py-9">
        <div className="flex flex-wrap items-baseline justify-between gap-x-10 gap-y-4">
          <p className="mono max-w-[46ch] leading-[1.8] text-[var(--dimmer)]">
            story-sim runs entirely on recurring free tiers. worlds are stored in this browser and
            nowhere else.
          </p>
          <Link
            href="/library"
            className="mono text-[var(--dim)] underline decoration-[var(--hair-bright)] underline-offset-[6px] transition-colors hover:text-[var(--text)] hover:decoration-[var(--lf-ochre)]"
          >
            open the atlas
          </Link>
        </div>
      </footer>
    </main>
  );
}
