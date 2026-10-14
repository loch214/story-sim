import { DAILY_NEURON_ALLOWANCE, NEURONS_PER_PLATE, PAGES } from './types';

/**
 * Cloudflare's allowance resets at 00:00 UTC. Resume re-checks whether the day
 * has turned before restarting the pool, rather than blindly retrying the failed
 * plate and rediscovering the halt.
 */
export interface QuotaWindow {
  resetAt: number;
  msRemaining: number;
  ready: boolean;
}

export function nextUtcMidnight(from: number): number {
  const date = new Date(from);
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + 1,
    0,
    0,
    0,
    0,
  );
}

export function quotaWindow(haltedAt: number, now = Date.now()): QuotaWindow {
  const resetAt = nextUtcMidnight(haltedAt);
  const msRemaining = Math.max(0, resetAt - now);
  return { resetAt, msRemaining, ready: now >= resetAt };
}

export function formatDuration(ms: number): string {
  const totalMinutes = Math.ceil(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

/** The reset moment in the reader's own clock — "00:00 UTC" means nothing to most people. */
export function formatLocalTime(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * The image allowance in the unit a reader thinks in: whole books. Neurons are
 * the honest measure but nobody outside the codebase knows what one is.
 * 10,000 a day over a 12–15 page book at 172.80 a plate is 3.8–4.8 books.
 */
export const BOOKS_PER_DAY = Math.round(
  DAILY_NEURON_ALLOWANCE / (((PAGES.min + PAGES.max) / 2) * NEURONS_PER_PLATE),
);
