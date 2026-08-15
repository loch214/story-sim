import { putImage } from './db';
import type { StoredChapter, StoredImage } from './types';

/**
 * The client-side render pool. Twelve independent HTTP requests, three at a
 * time, in reading order so plate 1 lands first.
 *
 * The transport is injectable so every halt, retry and refusal path can be
 * exercised in tests without spending a single neuron — at 172.8 neurons a
 * plate, debugging this against the live endpoint would cost more than a day's
 * allowance.
 */
export type PlateOutcome =
  | { kind: 'ready'; image: string; neurons: number; width: number; height: number }
  | { kind: 'refused'; message: string; code?: number }
  | { kind: 'bad_request'; message: string; code?: number }
  | { kind: 'rate_limit'; retryAfterSeconds: number; message: string }
  | { kind: 'quota_exhausted'; message: string }
  | { kind: 'config'; message: string }
  | { kind: 'error'; message: string };

export type Transport = (prompt: string, seed: number) => Promise<PlateOutcome>;

export type HaltReason =
  | { kind: 'quota'; message: string }
  | { kind: 'config'; message: string }
  | { kind: 'error'; message: string }
  /**
   * Something is wrong with the run as a whole, not with one page — a rejected
   * request shape, or refusals so widespread they cannot be about the subject.
   */
  | { kind: 'systemic'; message: string };

/**
 * Refusals are per-plate by design, so the pool tolerates them. But a chapter
 * that comes back mostly withheld is not graceful degradation, it is a broken
 * product, and historically it meant the fault was ours rather than the
 * prompt's. Past this many consecutive refusals with nothing drawn, stop and
 * say so instead of burning through the remaining pages.
 */
export const REFUSAL_STREAK_LIMIT = 4;

export interface RenderSummary {
  halt: HaltReason | null;
  rendered: number;
  refused: number;
  neurons: number;
}

export interface RenderOptions {
  transport?: Transport;
  concurrency?: number;
  /** Rate-limit retries per plate before the pool escalates to a quota halt. */
  maxRateLimitRetries?: number;
  /** Transient 5xx retries per plate. */
  maxErrorRetries?: number;
  sleep?: (ms: number) => Promise<void>;
  saveImage?: (image: StoredImage) => Promise<void>;
  toBlob?: (base64: string) => Promise<Blob | null>;
  onProgress?: (summary: { pageIndex: number; status: StoredImage['status']; neurons: number }) => void;
}

export const DEFAULT_CONCURRENCY = 3;

export async function renderChapter(
  chapter: StoredChapter,
  images: StoredImage[],
  options: RenderOptions = {},
): Promise<RenderSummary> {
  const {
    transport = httpTransport,
    concurrency = DEFAULT_CONCURRENCY,
    maxRateLimitRetries = 2,
    maxErrorRetries = 1,
    sleep = realSleep,
    saveImage = putImage,
    toBlob = base64ToBlob,
    onProgress,
  } = options;

  const queue = images
    .filter((image) => image.status === 'pending' || image.status === 'failed')
    .sort((a, b) => a.pageIndex - b.pageIndex);

  let cursor = 0;
  let halt: HaltReason | null = null;
  let rendered = 0;
  let refused = 0;
  let neurons = 0;
  let refusalStreak = 0;

  async function worker() {
    while (!halt) {
      const image = queue[cursor++];
      if (!image) return;

      await saveImage({ ...image, status: 'generating' });
      onProgress?.({ pageIndex: image.pageIndex, status: 'generating', neurons: 0 });

      let rateLimitRetries = 0;
      let errorRetries = 0;

      while (!halt) {
        const outcome = await transport(image.promptUsed, image.seed);

        if (outcome.kind === 'ready') {
          const blob = await toBlob(outcome.image);
          rendered++;
          refusalStreak = 0;
          neurons += outcome.neurons;
          await saveImage({
            ...image,
            blob,
            status: 'ready',
            neuronCost: outcome.neurons,
            failureCode: undefined,
            failureMessage: undefined,
          });
          onProgress?.({ pageIndex: image.pageIndex, status: 'ready', neurons: outcome.neurons });
          break;
        }

        // Our request was malformed, which has nothing to do with this page and
        // everything to do with every other one. Stop rather than mark twelve
        // plates refused for a fault none of them caused.
        if (outcome.kind === 'bad_request') {
          halt = { kind: 'systemic', message: outcome.message };
          await saveImage({
            ...image,
            status: 'pending',
            failureCode: outcome.code,
            failureMessage: outcome.message,
          });
          break;
        }

        // A rejected prompt is terminal for this plate and harmless to the rest.
        if (outcome.kind === 'refused') {
          refused++;
          refusalStreak++;
          await saveImage({
            ...image,
            status: 'refused',
            failureCode: outcome.code,
            failureMessage: outcome.message,
          });
          onProgress?.({ pageIndex: image.pageIndex, status: 'refused', neurons: 0 });

          // Nothing has drawn and the refusals keep coming: this is not a run of
          // unlucky subjects, it is one fault repeating.
          if (rendered === 0 && refusalStreak >= REFUSAL_STREAK_LIMIT) {
            halt = {
              kind: 'systemic',
              message: `${refusalStreak} plates rejected in a row with none drawn. Last reason: ${outcome.message}`,
            };
          }
          break;
        }

        if (outcome.kind === 'quota_exhausted') {
          halt = { kind: 'quota', message: outcome.message };
          await saveImage({ ...image, status: 'pending' });
          break;
        }

        if (outcome.kind === 'config') {
          halt = { kind: 'config', message: outcome.message };
          await saveImage({ ...image, status: 'pending' });
          break;
        }

        if (outcome.kind === 'rate_limit') {
          if (rateLimitRetries >= maxRateLimitRetries) {
            // Retries spent against a persistent 429: read it as exhaustion.
            halt = { kind: 'quota', message: outcome.message };
            await saveImage({ ...image, status: 'pending' });
            break;
          }
          rateLimitRetries++;
          await sleep(outcome.retryAfterSeconds * 1000);
          continue;
        }

        if (errorRetries >= maxErrorRetries) {
          halt = { kind: 'error', message: outcome.message };
          await saveImage({ ...image, status: 'failed' });
          onProgress?.({ pageIndex: image.pageIndex, status: 'failed', neurons: 0 });
          break;
        }
        errorRetries++;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));

  return { halt, rendered, refused, neurons };
}

/** Which terminal state a halt puts the chapter into. */
export function chapterStatusForHalt(halt: HaltReason | null): StoredChapter['status'] {
  if (!halt) return 'complete';
  // A systemic halt is an error state, not a quota one: the day's allowance is
  // intact and retrying after a fix costs nothing extra.
  return halt.kind === 'quota' ? 'halted_quota' : 'halted_error';
}

const httpTransport: Transport = async (prompt, seed) => {
  let response: Response;
  try {
    response = await fetch('/api/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, seed }),
    });
  } catch (cause) {
    return { kind: 'error', message: cause instanceof Error ? cause.message : 'Network error' };
  }

  const body = await response.json().catch(() => ({}));

  if (response.ok) {
    return {
      kind: 'ready',
      image: body.image,
      neurons: Number(body.neurons) || 0,
      width: Number(body.width) || 0,
      height: Number(body.height) || 0,
    };
  }

  const message = String(body.message ?? `Image service returned ${response.status}`);
  switch (body.error) {
    case 'quota_exhausted':
      return { kind: 'quota_exhausted', message };
    case 'rate_limit':
      return { kind: 'rate_limit', retryAfterSeconds: Number(body.retryAfterSeconds) || 8, message };
    case 'refused':
      return { kind: 'refused', message, code: Number(body.code) || undefined };
    case 'bad_request':
      return { kind: 'bad_request', message, code: Number(body.code) || undefined };
    case 'config':
      return { kind: 'config', message };
    default:
      return { kind: 'error', message };
  }
};

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function base64ToBlob(base64: string): Promise<Blob | null> {
  if (!base64) return null;
  const response = await fetch(`data:image/jpeg;base64,${base64}`);
  return response.blob();
}
