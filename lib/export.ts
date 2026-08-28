import { listChapters, listImages } from './db';
import type { StoredWorld } from './types';

/**
 * Images are excluded, so a world stays small enough to read or paste.
 *
 * Seeds are recorded but no longer reproduce a plate: Workers AI removed `seed`
 * from the flux-1-schnell input schema, so re-rendering an imported world gives
 * new artwork from the same prompts. See lib/cloudflare.ts.
 *
 * v2 adds `failureCode` and `failureMessage` per plate. An export is the only
 * artefact that survives a bad run, so it has to say why each plate failed —
 * without that, a ten-plate cluster took a live replay to explain.
 *
 * v3 adds `arc`. It was persisted from the moment it shipped but never
 * exported, so the one artefact used to review a chapter showed no sign of the
 * pacing it had chosen — which read as the feature not having shipped at all.
 * If it is not in the export, it does not exist as far as review is concerned.
 * See docs/SCHEMA.md § Export.
 *
 * v4 adds `mode`. A chapter is now either derived from a rule or told forward
 * from a story, and the two are written by different halves of the prompt and
 * judged by slightly different rules. Reviewing page text without knowing which
 * one produced it means reviewing against the wrong brief.
 *
 * v5 adds `throughLine`. It is the thread rule 20 checks page text against —
 * reviewing whether a chapter reads as one story means seeing what that
 * thread was supposed to be.
 */
export const EXPORT_VERSION = 5;

export interface WorldExport {
  version: number;
  exportedAt: string;
  world: StoredWorld;
  chapters: {
    id: string;
    number: number;
    rule: string;
    /** Which pipeline wrote it. Omitted before v4 — those chapters were all derived. */
    mode?: string;
    ruleType: string;
    transitionNote?: string;
    status: string;
    diagramHints: unknown;
    /** The thread rule 20 checks page text against. Omitted before v5. */
    throughLine?: unknown;
    priorCanon?: unknown;
    /** The pacing the chapter chose. Omitted before v3 — worlds made then have none. */
    arc?: unknown;
    chain: unknown;
    pages: unknown;
    plates: {
      pageIndex: number;
      seed: number;
      promptUsed: string;
      status: string;
      neuronCost: number;
      failureCode?: number;
      failureMessage?: string;
    }[];
  }[];
  totals: { plates: number; drawn: number; neurons: number };
}

export async function buildWorldExport(world: StoredWorld): Promise<WorldExport> {
  const chapters = await listChapters(world.id);
  let plates = 0;
  let drawn = 0;
  let neurons = 0;

  const exported: WorldExport['chapters'] = [];
  for (const chapter of chapters) {
    const images = (await listImages(chapter.id)).sort((a, b) => a.pageIndex - b.pageIndex);
    plates += images.length;
    drawn += images.filter((image) => image.status === 'ready').length;
    neurons += images.reduce((sum, image) => sum + (image.neuronCost || 0), 0);

    exported.push({
      id: chapter.id,
      number: chapter.number,
      rule: chapter.rule,
      mode: chapter.mode,
      ruleType: chapter.ruleType,
      transitionNote: chapter.transitionNote,
      status: chapter.status,
      diagramHints: chapter.diagramHints,
      throughLine: chapter.throughLine,
      priorCanon: chapter.priorCanon,
      arc: chapter.arc,
      chain: chapter.chain,
      pages: chapter.pages,
      plates: images.map((image) => ({
        pageIndex: image.pageIndex,
        seed: image.seed,
        promptUsed: image.promptUsed,
        status: image.status,
        neuronCost: image.neuronCost,
        failureCode: image.failureCode,
        failureMessage: image.failureMessage,
      })),
    });
  }

  return {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    world,
    chapters: exported,
    totals: { plates, drawn, neurons: Math.round(neurons * 10) / 10 },
  };
}

export function downloadJson(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function exportFilename(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return `${slug || 'world'}.json`;
}
