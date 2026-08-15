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
 * See docs/SCHEMA.md § Export.
 */
export const EXPORT_VERSION = 2;

export interface WorldExport {
  version: number;
  exportedAt: string;
  world: StoredWorld;
  chapters: {
    id: string;
    number: number;
    rule: string;
    ruleType: string;
    transitionNote?: string;
    status: string;
    diagramHints: unknown;
    priorCanon?: unknown;
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
      ruleType: chapter.ruleType,
      transitionNote: chapter.transitionNote,
      status: chapter.status,
      diagramHints: chapter.diagramHints,
      priorCanon: chapter.priorCanon,
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
