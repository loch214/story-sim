'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ChainDiagram from './ChainDiagram';
import IndexRail from './IndexRail';
import PlatePage from './PlatePage';
import RenderBar from './RenderBar';
import RuleComposer from './RuleComposer';
import { buildSpreads } from './spreads';
import { imageId, listImages, putChapter, putImage } from '@/lib/db';
import { demoArtwork, demoSeed } from '@/lib/demoArt';
import { chapterStatusForHalt, renderChapter, type HaltReason } from '@/lib/imageQueue';
import type { StoredChapter, StoredImage, StoredWorld } from '@/lib/types';

interface Props {
  world: StoredWorld;
  chapters: StoredChapter[];
  images: Map<string, StoredImage>;
  onClose: () => void;
  onImagesChanged: () => void;
  /** True when arriving straight from creating the world: one action, one result. */
  autoRender?: boolean;
}

const SWIPE_THRESHOLD = 48;

export default function Reader({
  world,
  chapters,
  images,
  onClose,
  onImagesChanged,
  autoRender = false,
}: Props) {
  const spreads = useMemo(() => buildSpreads(chapters, images), [chapters, images]);
  const [current, setCurrent] = useState(0);
  /**
   * The reasoning diagram, when the reader has explicitly asked for it. `null`
   * is the normal state: the book opens on plate 1, not on the machinery.
   */
  const [diagram, setDiagram] = useState<{ chapterId: string; highlight?: string } | null>(null);
  const [renderingChapterId, setRenderingChapterId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [pendingSpreadKey, setPendingSpreadKey] = useState<string | null>(null);
  const touchStart = useRef<number | null>(null);
  const autoRenderStarted = useRef(false);
  const pendingDraw = useRef<string | null>(null);

  const accent = chapters[0]?.diagramHints.palette[1] ?? '#c9a227';
  const spread = spreads[Math.min(current, spreads.length - 1)];
  const chapter = spread?.chapter ?? chapters[0];
  const diagramChapter = diagram ? chapters.find((c) => c.id === diagram.chapterId) : undefined;
  const movement = spread
    ? spread.chapter.arc?.find(
        (m) => spread.page.index >= m.fromPage && spread.page.index <= m.toPage,
      )
    : undefined;

  const plates = useMemo(
    () => [...images.values()].filter((image) => image.chapterId === chapter?.id),
    [images, chapter?.id],
  );
  const counts = {
    total: chapter?.pages.length ?? 0,
    ready: plates.filter((p) => p.status === 'ready').length,
    refused: plates.filter((p) => p.status === 'refused').length,
    pending: plates.filter((p) => p.status === 'pending' || p.status === 'failed').length,
    neurons: plates.reduce((sum, p) => sum + (p.neuronCost || 0), 0),
  };

  const draw = useCallback(
    async (target: StoredChapter) => {
      setRenderingChapterId(target.id);
      try {
        const stored = await listImages(target.id);
        await putChapter({ ...target, status: 'rendering', haltedAt: undefined, haltMessage: undefined });

        const summary = await renderChapter(target, stored, {
          onProgress: () => onImagesChanged(),
        });

        await putChapter({
          ...target,
          status: chapterStatusForHalt(summary.halt),
          haltedAt: summary.halt?.kind === 'quota' ? Date.now() : undefined,
          haltMessage: summary.halt?.message,
        });
      } finally {
        setRenderingChapterId(null);
        onImagesChanged();
      }
    },
    [onImagesChanged],
  );

  // Creating a world or adding a rule draws the plates: one action, one result.
  useEffect(() => {
    if (!autoRender || autoRenderStarted.current || !chapter) return;
    const hasPending = [...images.values()].some(
      (image) => image.chapterId === chapter.id && image.status === 'pending',
    );
    if (!hasPending) return;
    autoRenderStarted.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    draw(chapter);
  }, [autoRender, chapter, images, draw]);

  // A freshly appended chapter: jump to its first plate, then draw it.
  useEffect(() => {
    if (!pendingSpreadKey) return;
    const target = spreads.findIndex((s) => s.key === pendingSpreadKey);
    if (target < 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrent(target);
    setPendingSpreadKey(null);

    const chapterId = pendingDraw.current;
    pendingDraw.current = null;
    const targetChapter = chapters.find((c) => c.id === chapterId);
    if (targetChapter) draw(targetChapter);
  }, [pendingSpreadKey, spreads, chapters, draw]);

  const go = useCallback(
    (delta: number) => {
      setCurrent((index) => Math.min(spreads.length - 1, Math.max(0, index + delta)));
    },
    [spreads.length],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      // The diagram is a detour, not a page. Turning keys do nothing there, and
      // Escape steps back to the plate you left rather than out of the book.
      if (diagram) {
        if (event.key === 'Escape') {
          event.preventDefault();
          setDiagram(null);
        }
        return;
      }
      switch (event.key) {
        case 'ArrowRight':
        case 'PageDown':
          event.preventDefault();
          go(1);
          break;
        case 'ArrowLeft':
        case 'PageUp':
          event.preventDefault();
          go(-1);
          break;
        case 'Home':
          event.preventDefault();
          setCurrent(0);
          break;
        case 'End':
          event.preventDefault();
          setCurrent(spreads.length - 1);
          break;
        case 'Escape':
          onClose();
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose, spreads.length, diagram]);

  function openPage(chapterId: string, pageIndex: number) {
    const target = spreads.findIndex((s) => s.key === `${chapterId}:${pageIndex}`);
    if (target >= 0) {
      setDiagram(null);
      setCurrent(target);
    }
  }

  function openChain(chapterId: string, effectId?: string) {
    setDiagram({ chapterId, highlight: effectId });
  }

  /** Fixture tooling: judge the plate layout without spending neurons. */
  async function fillDemoArtwork() {
    if (!chapter) return;
    for (const page of chapter.pages) {
      const id = imageId(chapter.id, page.index);
      const existing = images.get(id);
      const refused = page.index === 7;
      await putImage({
        id,
        chapterId: chapter.id,
        pageIndex: page.index,
        blob: refused
          ? null
          : demoArtwork(demoSeed(chapter.id, page.index), chapter.diagramHints.palette, page.shotType),
        seed: existing?.seed ?? demoSeed(chapter.id, page.index),
        promptUsed: existing?.promptUsed ?? '',
        status: refused ? 'refused' : 'ready',
        neuronCost: 0,
      });
    }
    onImagesChanged();
  }

  async function clearArtwork() {
    if (!chapter) return;
    for (const page of chapter.pages) {
      const id = imageId(chapter.id, page.index);
      const existing = images.get(id);
      await putImage({
        id,
        chapterId: chapter.id,
        pageIndex: page.index,
        blob: null,
        seed: existing?.seed ?? 0,
        promptUsed: existing?.promptUsed ?? '',
        status: 'pending',
        neuronCost: 0,
      });
    }
    await putChapter({ ...chapter, status: 'rendering', haltedAt: undefined, haltMessage: undefined });
    onImagesChanged();
  }

  const isRendering = renderingChapterId === chapter?.id;
  const halt: HaltReason | null =
    chapter?.status === 'halted_quota'
      ? { kind: 'quota', message: chapter.haltMessage ?? '' }
      : chapter?.status === 'halted_error'
        ? { kind: 'error', message: chapter.haltMessage ?? '' }
        : null;

  return (
    <div
      className="flex min-h-dvh flex-col bg-[var(--ink)]"
      style={{ ['--accent' as string]: accent }}
      onTouchStart={(e) => {
        touchStart.current = e.changedTouches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const start = touchStart.current;
        const end = e.changedTouches[0]?.clientX;
        if (start === null || end === undefined) return;
        const delta = end - start;
        if (Math.abs(delta) > SWIPE_THRESHOLD) go(delta < 0 ? 1 : -1);
        touchStart.current = null;
      }}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-[var(--hair)] px-4 py-3 sm:px-6">
        <div className="flex items-baseline gap-4">
          <button
            type="button"
            onClick={onClose}
            className="mono text-[var(--dim)] transition-colors hover:text-[var(--text)]"
          >
            ← library
          </button>
          <h1 className="display text-lg text-[var(--text)]">{world.title}</h1>
        </div>
        <div className="flex items-center gap-4">
          <p className="mono text-[var(--dimmer)]">
            {chapters.length} chapter{chapters.length === 1 ? '' : 's'}
          </p>
          <button
            type="button"
            onClick={() => setComposing((open) => !open)}
            className="mono border border-[var(--hair)] px-3 py-1.5 text-[var(--dim)] transition-colors hover:border-[var(--hair-bright)] hover:text-[var(--text)]"
          >
            {composing ? 'close' : 'add a rule'}
          </button>
        </div>
      </header>

      {composing && (
        <div className="border-b border-[var(--hair)] px-4 py-5 sm:px-6">
          <RuleComposer
            target={{ mode: 'append', world, chapterNumber: chapters.length + 1 }}
            onCancel={() => setComposing(false)}
            onDone={() => {
              const chapterId = `${world.id}:${chapters.length + 1}`;
              pendingDraw.current = chapterId;
              setPendingSpreadKey(`${chapterId}:1`);
              setComposing(false);
              onImagesChanged();
            }}
          />
        </div>
      )}

      {chapter && (
        <RenderBar
          {...counts}
          phase={isRendering ? 'rendering' : halt ? 'halted' : 'idle'}
          halt={halt}
          haltedAt={chapter.haltedAt}
          hasArtwork={plates.some((p) => p.blob !== null)}
          onRender={() => draw(chapter)}
          onDemo={fillDemoArtwork}
          onClearArtwork={clearArtwork}
        />
      )}

      <main className="flex flex-1 items-center justify-center px-4 py-6 sm:px-6">
        {diagramChapter ? (
          <div className="h-full w-full max-w-6xl">
            <ChainDiagram
              chapter={diagramChapter}
              priorCanon={diagramChapter.priorCanon}
              onOpenPage={(pageIndex) => openPage(diagramChapter.id, pageIndex)}
              highlightEffectId={diagram?.highlight}
            />
          </div>
        ) : spread ? (
          <PlatePage
            page={spread.page}
            effect={spread.effect}
            image={spread.image}
            onOpenChain={(effectId) => openChain(spread.chapter.id, effectId)}
          />
        ) : null}
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-[var(--hair)] px-4 py-3 sm:px-6">
        <IndexRail
          spreads={spreads}
          current={current}
          onSelect={(index) => {
            setDiagram(null);
            setCurrent(index);
          }}
        />
        <div className="flex items-center gap-4">
          {/* The way in to the machinery, and the only one that is a front-door
              control. It sits beside the page count rather than in the header:
              available, plainly labelled, and never the thing you land on. */}
          <button
            type="button"
            onClick={() => (diagram ? setDiagram(null) : openChain(chapter.id))}
            className="mono border border-[var(--hair)] px-3 py-1.5 text-[var(--dim)] transition-colors hover:border-[var(--hair-bright)] hover:text-[var(--text)]"
          >
            {diagram ? 'back to the plates' : 'how this world works'}
          </button>
          <p className="mono text-[var(--dimmer)]">
            {diagram
              ? `ch.${diagramChapter?.number} · reasoning`
              : `ch.${spread?.chapter.number} · plate ${spread?.page.index}`}
          </p>
          {/* Which movement of the arc this plate belongs to. The pacing is
              chosen per premise, so naming it is how the reader feels the shape
              rather than just twelve pages in a row. */}
          {!diagram && movement && (
            <p className="mono hidden text-[var(--accent)] lg:block">{movement.label}</p>
          )}
          {!diagram && <p className="mono hidden text-[var(--dimmer)] md:block">← → to turn</p>}
        </div>
      </footer>
    </div>
  );
}
