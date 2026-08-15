'use client';

import { useEffect, useState } from 'react';
import RuleComposer from './RuleComposer';
import { deleteEverything, deleteWorld, listChapters, listImages, storageEstimate } from '@/lib/db';
import { buildWorldExport, downloadJson, exportFilename } from '@/lib/export';
import type { StoredWorld } from '@/lib/types';

interface WorldStats {
  chapters: number;
  plates: number;
  drawn: number;
  neurons: number;
}

interface Props {
  worlds: StoredWorld[];
  onOpen: (worldId: string) => void;
  onChanged: () => void;
  onSeedFixture: () => void;
  onCreated: (worldId: string) => void;
}

const number = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Library({ worlds, onOpen, onChanged, onSeedFixture, onCreated }: Props) {
  const [storage, setStorage] = useState({ usage: 0, quota: 0, persisted: false });
  const [confirming, setConfirming] = useState<string | null>(null);
  const [stats, setStats] = useState<Record<string, WorldStats>>({});

  useEffect(() => {
    storageEstimate().then(setStorage);
  }, [worlds]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<string, WorldStats> = {};
      for (const world of worlds) {
        const chapters = await listChapters(world.id);
        let plates = 0;
        let drawn = 0;
        let neurons = 0;
        for (const chapter of chapters) {
          const images = await listImages(chapter.id);
          plates += images.length;
          drawn += images.filter((image) => image.status === 'ready').length;
          neurons += images.reduce((sum, image) => sum + (image.neuronCost || 0), 0);
        }
        next[world.id] = { chapters: chapters.length, plates, drawn, neurons };
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
    <div className="mx-auto min-h-dvh w-full max-w-4xl px-5 py-10 sm:px-8 sm:py-16">
      <header className="mb-8">
        <h1 className="display text-4xl leading-none text-[var(--text)] sm:text-6xl">
          Story-sim
        </h1>
        <p className="mt-3 max-w-lg text-[1.05rem] leading-relaxed text-[var(--dim)]">
          Change one rule of reality. Read the world that results.
        </p>
      </header>

      <div className="mb-14">
        <RuleComposer target={{ mode: 'new' }} onDone={onCreated} />
      </div>

      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-[var(--hair)] pb-2">
        <h2 className="mono text-[var(--dim)]">worlds</h2>
        <p className="mono text-[var(--dimmer)]">
          {formatBytes(storage.usage)} stored
          {storage.quota > 0 && ` of ${formatBytes(storage.quota)}`}
          {' · '}
          {storage.persisted ? 'persistent' : 'evictable'}
        </p>
      </div>

      {worlds.length === 0 ? (
        <div className="border border-dashed border-[var(--hair)] px-6 py-14 text-center">
          <p className="text-[1.05rem] leading-relaxed text-[var(--dim)]">
            No worlds yet.
          </p>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-[var(--dimmer)]">
            Type a rule above to build one, or load the fixture world to read a finished
            chapter without spending quota.
          </p>
          <button
            type="button"
            onClick={onSeedFixture}
            className="mono mt-6 border border-[var(--hair-bright)] px-4 py-2 text-[var(--text)] transition-colors hover:bg-[var(--raised)]"
          >
            load fixture world
          </button>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--hair)]">
          {worlds.map((world) => (
            <li key={world.id} className="flex flex-wrap items-center gap-x-6 gap-y-3 py-5">
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => onOpen(world.id)}
                  className="display block text-left text-2xl text-[var(--text)] transition-colors hover:text-[var(--accent)]"
                >
                  {world.title}
                </button>
                <p className="mono mt-1 truncate text-[var(--dimmer)]">
                  {world.worldCanon.activeRules.map((r) => r.rule).join(' · ')}
                </p>
                {stats[world.id] && (
                  <p className="mono mt-1 text-[var(--dimmer)]">
                    {stats[world.id].chapters} chapter{stats[world.id].chapters === 1 ? '' : 's'} ·{' '}
                    {stats[world.id].drawn}/{stats[world.id].plates} plates drawn
                    {stats[world.id].neurons > 0 &&
                      ` · ${number.format(stats[world.id].neurons)} neurons`}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-4">
                <div className="flex" aria-hidden title="This world's frozen palette">
                  {world.palette.map((colour) => (
                    <span key={colour} className="h-4 w-2" style={{ background: colour }} />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={async () => downloadJson(exportFilename(world.title), await buildWorldExport(world))}
                  className="mono text-[var(--dimmer)] transition-colors hover:text-[var(--text)]"
                  title="Canon, chain, pages, prompts and seeds. Images excluded."
                >
                  export
                </button>
                <button
                  type="button"
                  onClick={() => onOpen(world.id)}
                  className="mono border border-[var(--hair)] px-3 py-1.5 text-[var(--dim)] transition-colors hover:border-[var(--hair-bright)] hover:text-[var(--text)]"
                >
                  open
                </button>
                {confirming === world.id ? (
                  <span className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => remove(world.id)}
                      className="mono border border-[#d96a5b] px-3 py-1.5 text-[#d96a5b] transition-colors hover:bg-[#d96a5b] hover:text-[var(--ink)]"
                    >
                      delete for good
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(null)}
                      className="mono text-[var(--dimmer)] hover:text-[var(--text)]"
                    >
                      keep
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirming(world.id)}
                    className="mono text-[var(--dimmer)] transition-colors hover:text-[#d96a5b]"
                  >
                    delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <footer className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--hair)] pt-5">
        <p className="mono max-w-md leading-relaxed text-[var(--dimmer)]">
          worlds live only in this browser. deleting one cannot be undone.
        </p>
        <div className="flex items-center gap-3">
          {worlds.length > 0 && (
            <button
              type="button"
              onClick={onSeedFixture}
              className="mono text-[var(--dimmer)] transition-colors hover:text-[var(--text)]"
            >
              load fixture world
            </button>
          )}
          {confirming === 'all' ? (
            <>
              <button
                type="button"
                onClick={removeAll}
                className="mono border border-[#d96a5b] px-3 py-1.5 text-[#d96a5b] transition-colors hover:bg-[#d96a5b] hover:text-[var(--ink)]"
              >
                delete everything for good
              </button>
              <button
                type="button"
                onClick={() => setConfirming(null)}
                className="mono text-[var(--dimmer)] hover:text-[var(--text)]"
              >
                keep
              </button>
            </>
          ) : (
            worlds.length > 0 && (
              <button
                type="button"
                onClick={() => setConfirming('all')}
                className="mono text-[var(--dimmer)] transition-colors hover:text-[#d96a5b]"
              >
                delete everything
              </button>
            )
          )}
        </div>
      </footer>
    </div>
  );
}
