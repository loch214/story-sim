/**
 * Exercises every path through the render pool with a fake transport — halts,
 * retries, refusals, concurrency — at zero neuron cost. A real plate costs
 * 172.8 neurons, so debugging this against the live endpoint would burn more
 * than a day's allowance.
 *
 *   npm run check:queue
 */
import {
  chapterStatusForHalt,
  REFUSAL_STREAK_LIMIT,
  renderChapter,
  type PlateOutcome,
  type RenderOptions,
  type Transport,
} from '../lib/imageQueue';
import { formatDuration, quotaWindow } from '../lib/quota';
import type { StoredChapter, StoredImage } from '../lib/types';

let failures = 0;

function check(label: string, condition: boolean, detail = '') {
  if (condition) {
    console.log(`✓ ${label}`);
  } else {
    failures++;
    console.error(`✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const chapter = { id: 'w:1', number: 1 } as StoredChapter;

function plates(count = 12): StoredImage[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `w:1:${i + 1}`,
    chapterId: 'w:1',
    pageIndex: i + 1,
    blob: null,
    seed: 1000 + i,
    promptUsed: `prompt for plate ${i + 1}`,
    status: 'pending' as const,
    neuronCost: 0,
  }));
}

function harness(transport: Transport, overrides: RenderOptions = {}) {
  const saved: StoredImage[] = [];
  const options: RenderOptions = {
    transport,
    sleep: async () => {},
    toBlob: async () => null,
    saveImage: async (image) => {
      saved.push(image);
    },
    ...overrides,
  };
  return { saved, options };
}

const ready = (neurons = 172.8): PlateOutcome => ({
  kind: 'ready',
  image: 'AAAA',
  neurons,
  width: 1024,
  height: 1024,
});

async function main() {
// ── 1. Happy path ─────────────────────────────────────────────────────────
{
  const order: number[] = [];
  const transport: Transport = async (prompt) => {
    order.push(Number(prompt.match(/\d+$/)?.[0]));
    return ready();
  };
  const { saved, options } = harness(transport);
  const summary = await renderChapter(chapter, plates(), options);

  check('happy path renders all twelve', summary.rendered === 12, `got ${summary.rendered}`);
  check('happy path does not halt', summary.halt === null);
  check('neurons are summed from the transport', Math.round(summary.neurons) === 2074, `got ${summary.neurons}`);
  check('plate 1 is requested first', order[0] === 1, `got ${order[0]}`);
  check('chapter completes', chapterStatusForHalt(summary.halt) === 'complete');
  check('every plate ends ready', saved.filter((i) => i.status === 'ready').length === 12);
}

// ── 2. A refusal is terminal for one plate and harmless to the rest ───────
{
  const transport: Transport = async (prompt) =>
    prompt.endsWith(' 7') ? { kind: 'refused', message: 'prompt rejected' } : ready();
  const { saved, options } = harness(transport);
  const summary = await renderChapter(chapter, plates(), options);

  check('refusal does not halt the pool', summary.halt === null);
  check('refusal renders the other eleven', summary.rendered === 11, `got ${summary.rendered}`);
  check('refusal is counted', summary.refused === 1);
  check('refused plate is marked refused', saved.some((i) => i.pageIndex === 7 && i.status === 'refused'));
  check('refused plate never becomes ready', !saved.some((i) => i.pageIndex === 7 && i.status === 'ready'));
}

// ── 3. Quota exhaustion halts and preserves what rendered ────────────────
{
  let calls = 0;
  const transport: Transport = async () => {
    calls++;
    return calls > 4 ? { kind: 'quota_exhausted', message: 'daily allowance gone' } : ready();
  };
  const { saved, options } = harness(transport, { concurrency: 1 });
  const summary = await renderChapter(chapter, plates(), options);

  check('quota exhaustion halts', summary.halt?.kind === 'quota');
  check('quota halt keeps completed plates', summary.rendered === 4, `got ${summary.rendered}`);
  check('quota halt maps to halted_quota', chapterStatusForHalt(summary.halt) === 'halted_quota');
  check(
    'the interrupted plate returns to pending so resume can pick it up',
    saved.at(-1)?.status === 'pending',
    `got ${saved.at(-1)?.status}`,
  );
}

// ── 4. A rate limit is a wait, not a failure ─────────────────────────────
{
  const attempts = new Map<string, number>();
  const slept: number[] = [];
  const transport: Transport = async (prompt) => {
    const n = (attempts.get(prompt) ?? 0) + 1;
    attempts.set(prompt, n);
    return n === 1 ? { kind: 'rate_limit', retryAfterSeconds: 4, message: 'slow down' } : ready();
  };
  const { options } = harness(transport, { sleep: async (ms) => void slept.push(ms) });
  const summary = await renderChapter(chapter, plates(), options);

  check('a transient rate limit still renders everything', summary.rendered === 12, `got ${summary.rendered}`);
  check('a transient rate limit does not halt', summary.halt === null);
  check('the retry honours the advertised delay', slept[0] === 4000, `got ${slept[0]}`);
}

// ── 5. A persistent 429 escalates to a quota halt ────────────────────────
{
  const transport: Transport = async () => ({ kind: 'rate_limit', retryAfterSeconds: 1, message: 'still limited' });
  const { options } = harness(transport, { concurrency: 1, maxRateLimitRetries: 2 });
  const summary = await renderChapter(chapter, plates(), options);

  check('an unrelenting 429 is read as exhaustion', summary.halt?.kind === 'quota');
  check('nothing renders under a persistent 429', summary.rendered === 0);
}

// ── 6 & 7. Transient versus persistent upstream errors ───────────────────
{
  const attempts = new Map<string, number>();
  const transport: Transport = async (prompt) => {
    const n = (attempts.get(prompt) ?? 0) + 1;
    attempts.set(prompt, n);
    return n === 1 ? { kind: 'error', message: 'gateway blip' } : ready();
  };
  const { options } = harness(transport);
  const summary = await renderChapter(chapter, plates(), options);
  check('a transient 5xx recovers on the one retry', summary.rendered === 12 && summary.halt === null);
}
{
  const transport: Transport = async () => ({ kind: 'error', message: 'upstream down' });
  const { saved, options } = harness(transport, { concurrency: 1 });
  const summary = await renderChapter(chapter, plates(), options);
  check('a persistent 5xx halts as an error', summary.halt?.kind === 'error');
  check('a persistent 5xx maps to halted_error', chapterStatusForHalt(summary.halt) === 'halted_error');
  check('the failed plate is marked failed', saved.some((i) => i.status === 'failed'));
}

// ── 8. A credentials problem halts rather than refusing twelve plates ────
{
  const transport: Transport = async () => ({ kind: 'config', message: 'token rejected' });
  const { options } = harness(transport, { concurrency: 1 });
  const summary = await renderChapter(chapter, plates(), options);
  check('a config failure halts immediately', summary.halt?.kind === 'config');
  check('a config failure renders nothing', summary.rendered === 0);
}

// ── 9. The pool honours its width ────────────────────────────────────────
{
  let inFlight = 0;
  let peak = 0;
  const transport: Transport = async () => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight--;
    return ready();
  };
  const { options } = harness(transport, { concurrency: 3 });
  await renderChapter(chapter, plates(), options);
  check('never more than three requests in flight', peak <= 3, `peaked at ${peak}`);
  check('the pool actually parallelises', peak === 3, `peaked at ${peak}`);
}

// ── 10. Resume only picks up what is unfinished ──────────────────────────
{
  const partial = plates();
  partial[0].status = 'ready';
  partial[1].status = 'refused';
  partial[2].status = 'failed';
  const transport: Transport = async () => ready();
  const { options } = harness(transport);
  const summary = await renderChapter(chapter, partial, options);

  check('resume skips ready plates', summary.rendered === 10, `got ${summary.rendered}`);
  check('resume leaves a refusal alone', summary.refused === 0);
}

// ── 11. Resume re-checks the day rather than retrying blindly ────────────
{
  const halted = Date.UTC(2026, 7, 14, 18, 30);
  const sameDay = quotaWindow(halted, Date.UTC(2026, 7, 14, 23, 0));
  const afterMidnight = quotaWindow(halted, Date.UTC(2026, 7, 15, 0, 1));

  check('a halt before midnight UTC is not resumable yet', !sameDay.ready);
  check('the wait is reported, not guessed', formatDuration(sameDay.msRemaining) === '1h 0m', formatDuration(sameDay.msRemaining));
  check('past 00:00 UTC the allowance is treated as returned', afterMidnight.ready);
  check('the reset lands on the next UTC midnight', new Date(sameDay.resetAt).toISOString() === '2026-08-15T00:00:00.000Z');
}

// ── 12. A malformed request halts instead of refusing twelve plates ──────
// The regression that cost ten plates: Workers AI rejected the `seed` field and
// every 4xx was read as a content refusal, so the pool cheerfully marked page
// after page "withheld" for a fault that had nothing to do with any of them.
{
  const transport: Transport = async () => ({
    kind: 'bad_request',
    message: "AiError: Bad input: Additional or unevaluated properties '/seed' at '/' not allowed",
    code: 5006,
  });
  const { saved, options } = harness(transport, { concurrency: 1 });
  const summary = await renderChapter(chapter, plates(), options);

  check('a rejected request shape halts as systemic', summary.halt?.kind === 'systemic');
  check('a rejected request shape refuses nothing', summary.refused === 0, `got ${summary.refused}`);
  check('a rejected request shape renders nothing', summary.rendered === 0);
  check('a systemic halt maps to halted_error', chapterStatusForHalt(summary.halt) === 'halted_error');
  check(
    'the plate stays pending so a fix can resume it',
    saved.at(-1)?.status === 'pending',
    `got ${saved.at(-1)?.status}`,
  );
  check('the upstream code is kept on the plate', saved.at(-1)?.failureCode === 5006);
}

// ── 13. Wholesale refusals are recognised as one fault, not twelve ───────
{
  const transport: Transport = async () => ({ kind: 'refused', message: 'nope', code: 5007 });
  const { saved, options } = harness(transport, { concurrency: 1 });
  const summary = await renderChapter(chapter, plates(), options);

  check('unrelenting refusals halt rather than gutting the chapter', summary.halt?.kind === 'systemic');
  check(
    'the breaker trips at the limit rather than after all twelve',
    summary.refused === REFUSAL_STREAK_LIMIT,
    `got ${summary.refused}`,
  );
  check('the refusal reason is kept on the plate', saved.at(-1)?.failureMessage === 'nope');
  check('the refusal code is kept on the plate', saved.at(-1)?.failureCode === 5007);
}

// ── 14. Scattered refusals are still graceful degradation ────────────────
// The breaker must not fire on the failure mode it is meant to tolerate: a
// couple of genuinely rejected subjects in an otherwise healthy chapter.
{
  const transport: Transport = async (prompt) =>
    /\b(3|9)$/.test(prompt) ? { kind: 'refused', message: 'subject rejected' } : ready();
  const { options } = harness(transport, { concurrency: 1 });
  const summary = await renderChapter(chapter, plates(), options);

  check('two scattered refusals do not trip the breaker', summary.halt === null);
  check('two scattered refusals still render ten', summary.rendered === 10, `got ${summary.rendered}`);
  check('a success resets the refusal streak', summary.refused === 2, `got ${summary.refused}`);
}

console.log(failures === 0 ? '\nAll render-pool paths pass.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
}

main();
