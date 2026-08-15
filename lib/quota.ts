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
