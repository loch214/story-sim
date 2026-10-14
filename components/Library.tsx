'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import RuleComposer from './RuleComposer';
import { deleteEverything, deleteWorld, listChapters, listImages } from '@/lib/db';
import { buildWorldExport, downloadJson, exportFilename } from '@/lib/export';
import { fixtureChapter } from '@/fixtures/chapter-1';
import type { StoredWorld } from '@/lib/types';

interface WorldStats {
  chapters: number;
  pages: number;
  drawn: number;
}

interface Props {
  worlds: StoredWorld[];
  onOpen: (worldId: string) => void;
  onChanged: () => void;
  onSeedFixture: () => void;
  onCreated: (worldId: string) => void;
}

const STEPS = [
  'Type a “what if”.',
  'Story-sim writes a short story set in that world and draws a picture for every page.',
  'Read it like a book, one page at a time.',
];

const INLINE_LINK =
  'underline decoration-[var(--hair-bright)] underline-offset-4 transition-colors hover:text-[var(--text)] hover:decoration-[var(--accent)]';

export default function Library({ worlds, onOpen, onChanged, onSeedFixture, onCreated }: Props) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [stats, setStats] = useState<Record<string, WorldStats>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<string, WorldStats> = {};
      for (const world of worlds) {
        const chapters = await listChapters(world.id);
        let pages = 0;
        let drawn = 0;
        for (const chapter of chapters) {
          const images = await listImages(chapter.id);
          pages += images.length;
          drawn += images.filter((image) => image.status === 'ready').length;
        }
        next[world.id] = { chapters: chapters.length, pages, drawn };
      }
      if (!cancelled) setStats(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [worlds]);

  async function remove(worldId: string) {
    await deleteWorld(worldId);
    setConfirming(null);
    onChanged();
  }

  async function removeAll() {
    await deleteEverything();
    setConfirming(null);
    onChanged();
  }

  return (
    <div className="mx-auto min-h-dvh w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-16">
      <header className="mb-10">
        <Link href="/" className="display text-4xl leading-none text-[var(--text)] sm:text-5xl">
          Story-sim
        </Link>
        <p className="mt-3 max-w-lg text-[1.15rem] leading-relaxed text-[var(--dim)]">
          Change one rule of reality. Read the world that results.
        </p>
        <ol className="mt-7 grid gap-3 sm:grid-cols-3 sm:gap-5">
          {STEPS.map((step, i) => (
            <li key={step} className="flex gap-3 text-[0.98rem] leading-snug text-[var(--dim)]">
              <span
                aria-hidden
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--hair-bright)] text-[0.9rem] text-[var(--text)]"
              >
                {i + 1}
              </span>
              <span className="pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
      </header>

      <RuleComposer target={{ mode: 'new' }} onDone={onCreated} />

      {/* Reading the example costs nothing, so it is offered to everyone — not
          only on an empty shelf, where a first-time visitor would have to find
          it below the fold. Hidden once it is already on the shelf. */}
      {!worlds.some((world) => world.title === fixtureChapter.worldTitle) && (
        <p className="mt-5 text-[1rem] text-[var(--dim)]">
          Not sure yet?{' '}
          <button type="button" onClick={onSeedFixture} className="btn-quiet">
            Read an example book first
          </button>
        </p>
      )}

      <section className="mt-16" aria-labelledby="your-worlds">
        <h2 id="your-worlds" className="display mb-2 text-2xl text-[var(--text)]">
          Your books
        </h2>
        <p className="mb-6 text-[0.98rem] leading-relaxed text-[var(--dimmer)]">
          Each book is a world you can keep adding chapters to.
        </p>

        {worlds.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[var(--hair)] px-6 py-10 text-center text-[1.02rem] leading-relaxed text-[var(--dim)]">
            Nothing here yet. The books you make will appear here.
          </p>
        ) : (
          <ul className="space-y-3">
            {worlds.map((world) => {
              const stat = stats[world.id];
              const unfinished = stat && stat.drawn < stat.pages;
              return (
                <li
                  key={world.id}
                  className="rounded-2xl border border-[var(--hair)] bg-[var(--rail)] px-5 py-4 sm:px-6"
                >
                  <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => onOpen(world.id)}
                        className="display text-left text-2xl leading-tight text-[var(--text)] transition-colors hover:text-[var(--accent)]"
                      >
                        {world.title}
                      </button>
                      <p className="mt-1 text-[1rem] italic leading-snug text-[var(--dim)]">
                        {world.worldCanon.activeRules.map((r) => `“${r.rule}”`).join(' + ')}
                      </p>
                    </div>
                    <button type="button" onClick={() => onOpen(world.id)} className="btn">
                      Read
                    </button>
                  </div>

                  {confirming === world.id ? (
                    <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-[var(--hair)] pt-3">
                      <p className="text-[0.98rem] text-[var(--text)]">
                        Delete “{world.title}”? This can’t be undone.
                      </p>
                      <button type="button" onClick={() => remove(world.id)} className="btn btn-danger">
                        Delete book
                      </button>
                      <button type="button" onClick={() => setConfirming(null)} className="btn">
                        Keep it
                      </button>
                    </div>
                  ) : (
                    <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.95rem] text-[var(--dimmer)]">
                      {stat && (
                        <span>
                          {stat.chapters} chapter{stat.chapters === 1 ? '' : 's'}
                          {unfinished && ` · ${stat.pages - stat.drawn} pictures still to draw`}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={async () =>
                          downloadJson(exportFilename(world.title), await buildWorldExport(world))
                        }
                        className={INLINE_LINK}
                        title="Saves the story text and how it was made as a file. Pictures aren’t included."
                      >
                        Download a copy
                      </button>
                      <button type="button" onClick={() => setConfirming(world.id)} className={INLINE_LINK}>
                        Delete
                      </button>
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <footer className="mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--hair)] pt-6">
        <p className="max-w-md text-[0.95rem] leading-relaxed text-[var(--dimmer)]">
          Your books are saved in this browser only — no account needed. Clearing your browser
          data will erase them.
        </p>
        {worlds.length > 0 &&
          (confirming === 'all' ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-[0.95rem] text-[var(--text)]">Delete every book?</p>
              <button type="button" onClick={removeAll} className="btn btn-danger">
                Delete all
              </button>
              <button type="button" onClick={() => setConfirming(null)} className="btn">
                Keep them
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming('all')}
              className="btn-quiet text-[0.95rem]"
            >
              Delete all books
            </button>
          ))}
      </footer>
    </div>
  );
}
