'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Library from '@/components/Library';
import Reader from '@/components/Reader';
import { listChapters, listImages, listWorlds } from '@/lib/db';
import { fixtureChapter } from '@/fixtures/chapter-1';
import { seedFixtureWorld } from '@/fixtures/seed';
import type { StoredChapter, StoredImage, StoredWorld } from '@/lib/types';

/**
 * Client-side throughout: IndexedDB is the only store, so there is nothing for
 * the server to render. View state rather than routes — the library is the home
 * screen and a world opens in place.
 */
export default function Home() {
  const [worlds, setWorlds] = useState<StoredWorld[]>([]);
  const [openWorldId, setOpenWorldId] = useState<string | null>(null);
  /** Set only when a world was just built, so its plates draw without asking. */
  const [autoRenderWorldId, setAutoRenderWorldId] = useState<string | null>(null);
  const [chapters, setChapters] = useState<StoredChapter[]>([]);
  const [images, setImages] = useState<Map<string, StoredImage>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Set once the ?read=long-fall deep link from the landing page is honoured. */
  const deepLinked = useRef(false);

  const refreshWorlds = useCallback(async () => {
    try {
      setWorlds(await listWorlds());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read local storage.');
    } finally {
      setLoaded(true);
    }
  }, []);

  const refreshOpenWorld = useCallback(async (worldId: string) => {
    const loadedChapters = await listChapters(worldId);
    const all = await Promise.all(loadedChapters.map((chapter) => listImages(chapter.id)));
    setChapters(loadedChapters);
    setImages(new Map(all.flat().map((image) => [image.id, image])));
  }, []);

  // Both effects load from IndexedDB and set state only after an await, so no
  // render cascades — the rule cannot see through the async boundary.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshWorlds();
  }, [refreshWorlds]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (openWorldId) refreshOpenWorld(openWorldId);
  }, [openWorldId, refreshOpenWorld]);

  // "read the long fall" on the landing page lands here. Seeding the fixture is
  // local-only and costs no quota, so it can happen without asking — but only
  // once, and only if that world is not already on the shelf.
  useEffect(() => {
    if (!loaded || deepLinked.current) return;
    if (new URLSearchParams(window.location.search).get('read') !== 'long-fall') return;
    deepLinked.current = true;
    window.history.replaceState(null, '', '/library');
    (async () => {
      const shelf = await listWorlds();
      const existing = shelf.find((world) => world.title === fixtureChapter.worldTitle);
      setOpenWorldId(existing ? existing.id : await seedFixtureWorld());
      await refreshWorlds();
    })().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : 'Could not load the fixture world.');
    });
  }, [loaded, refreshWorlds]);

  async function seedFixture() {
    try {
      const worldId = await seedFixtureWorld();
      await refreshWorlds();
      setOpenWorldId(worldId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the fixture world.');
    }
  }

  const openWorld = worlds.find((world) => world.id === openWorldId);

  if (error) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
        <h1 className="display mb-3 text-2xl text-[var(--text)]">Your books couldn’t be opened</h1>
        <p className="text-[1.05rem] leading-relaxed text-[var(--dim)]">
          Story-sim keeps your books inside this browser, and it couldn’t read them. Private or
          incognito windows sometimes block this — try a normal window, or reload the page.
        </p>
        <details className="mt-5 text-[var(--dimmer)]">
          <summary className="cursor-pointer text-[0.95rem]">Technical details</summary>
          <p className="mt-2 text-[0.9rem] leading-relaxed">{error}</p>
        </details>
      </main>
    );
  }

  if (!loaded) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <p className="text-[1.05rem] text-[var(--dimmer)]">Opening your books…</p>
      </main>
    );
  }

  if (openWorld && chapters.length > 0) {
    return (
      <Reader
        world={openWorld}
        chapters={chapters}
        images={images}
        autoRender={autoRenderWorldId === openWorld.id}
        onClose={() => {
          setAutoRenderWorldId(null);
          setOpenWorldId(null);
        }}
        onImagesChanged={async () => {
          // Appending a chapter replaces the world's canon, so the world record
          // has to be re-read too — otherwise the next rule would be reasoned
          // against a stale canon and the compounding would quietly break.
          await Promise.all([refreshWorlds(), refreshOpenWorld(openWorld.id)]);
        }}
      />
    );
  }

  return (
    <Library
      worlds={worlds}
      onOpen={setOpenWorldId}
      onChanged={refreshWorlds}
      onSeedFixture={seedFixture}
      onCreated={async (worldId) => {
        await refreshWorlds();
        setAutoRenderWorldId(worldId);
        setOpenWorldId(worldId);
      }}
    />
  );
}
