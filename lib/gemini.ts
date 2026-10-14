import { EnvError } from './env';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Gemini's 429 carries its own discriminator, so classification is free:
 * QuotaFailure.quotaId names the quota, and RetryInfo.retryDelay carries the
 * wait. There is no retry-after header — the delay is in the body.
 *
 * An unclassified 429 is treated as a rate limit: the caller retries once and
 * surfaces exhaustion only if that fails too, which is the safe reading in both
 * directions. See PLAN.md § Failure model.
 */
export type GeminiFailure =
  | { kind: 'rate_limit'; retryAfterSeconds: number; quotaId: string; quotaValue?: string }
  | { kind: 'quota_exhausted'; quotaId: string; quotaValue?: string }
  | { kind: 'blocked'; reason: string }
  | { kind: 'truncated' }
  | { kind: 'malformed'; raw: string }
  | { kind: 'config'; message: string }
  | { kind: 'http'; status: number; message: string };

export interface GeminiUsage {
  promptTokens: number;
  outputTokens: number;
  thinkingTokens: number;
}

export type GeminiResult =
  | { ok: true; value: unknown; raw: string; usage: GeminiUsage; model: string }
  | { ok: false; failure: GeminiFailure; raw?: string };

interface CallOptions {
  apiKey: string;
  /**
   * Tried in order. A model that is busy, rate-limited or out of its daily
   * allowance hands over to the next — each has its own free allowance.
   */
  models: readonly string[];
  /** Tried once each, only after `models` have all failed twice over. */
  lastResort?: readonly string[];
  prompt: string;
  maxOutputTokens: number;
  /** Off for the pre-flight classifier, on for chapter reasoning. */
  thinking: boolean;
}

interface JsonCallOptions extends CallOptions {
  schema: unknown;
}

export type GeminiTextResult =
  | { ok: true; text: string; usage: GeminiUsage; model: string }
  | { ok: false; failure: GeminiFailure; raw?: string };

/**
 * Plain prose, no schema. The story pass uses this: a story written into a
 * JSON field under two dozen constraints came back sounding like a form being
 * filled in, so the writing step gets nothing but the brief.
 */
export async function generateText(options: CallOptions): Promise<GeminiTextResult> {
  const result = await call(options, undefined);
  if (!result.ok) return result;
  return { ok: true, text: result.raw, usage: result.usage, model: result.model };
}

export async function generateJson(options: JsonCallOptions): Promise<GeminiResult> {
  const result = await call(options, options.schema);
  if (!result.ok) return result;
  try {
    return { ok: true, value: JSON.parse(result.raw), raw: result.raw, usage: result.usage, model: result.model };
  } catch {
    return { ok: false, failure: { kind: 'malformed', raw: result.raw }, raw: result.raw };
  }
}

/**
 * "No thinking" is spelled differently per generation. Gemini 2.5 takes
 * `thinkingBudget: 0`; gemini-3.5-flash-lite rejects that with a bare
 * "invalid argument" and wants `thinkingLevel` instead, which every 3.x model
 * accepts. "minimal" measured 0 thinking tokens and ~1s on 3.5-flash-lite.
 */
function thinkingOff(model: string) {
  return /^gemini-[3-9]/.test(model) ? { thinkingLevel: 'minimal' } : { thinkingBudget: 0 };
}

type CallResult =
  | { ok: true; raw: string; usage: GeminiUsage; model: string }
  | { ok: false; failure: GeminiFailure; raw?: string };

/**
 * Pause before a second pass over the models that were only busy. "This model
 * is currently experiencing high demand" is Google shedding free-tier load,
 * not a fault in the request. Every attempt — the 503s included — spends one
 * of that model's free daily requests (20 a day on gemini-3.6-flash), so a
 * busy model gets one more try, not a backoff ladder: 4s/12s retries on a
 * single model burned three requests per chapter and still failed.
 */
const BUSY_PAUSE_MS = 20_000;

/**
 * How long one model gets to answer. Under load gemini-3.8-flash took minutes
 * just to say "busy", and a chapter that walked the list twice ran past
 * fifteen minutes. A model that has not answered by now is treated as
 * unavailable for this call — handed over, and not given a second pass. Long
 * enough for a real answer: a full plates response from 3.8 once took 4.3 min
 * for the whole chapter, two calls.
 */
const MODEL_TIMEOUT_MS = 180_000;
const TIMED_OUT = 504;

const isBusy = (failure: GeminiFailure) => failure.kind === 'http' && failure.status === 503;
const isOverloaded = (failure: GeminiFailure) =>
  failure.kind === 'http' && (failure.status === 503 || failure.status === TIMED_OUT);

/**
 * Failures about one model's capacity or allowance rather than the request —
 * the next model may well answer. 404 is a model this key cannot reach (2.5
 * models now say "no longer available to new users").
 */
const handsOver = (failure: GeminiFailure) =>
  isOverloaded(failure) ||
  (failure.kind === 'http' && failure.status === 404) ||
  failure.kind === 'rate_limit' ||
  failure.kind === 'quota_exhausted';

/**
 * Walks the models in order; the first answer wins. Models that were only busy
 * get one more pass after a pause. Models out of allowance are done for the
 * day and are not tried again. Last-resort models are tried once each, at the
 * very end.
 */
async function call(options: CallOptions, schema: unknown): Promise<CallResult> {
  let pending = [...options.models];
  const failures: GeminiFailure[] = [];

  const attempt = async (model: string): Promise<CallResult | undefined> => {
    const started = Date.now();
    const result = await callModel(options, model, schema);
    const seconds = Math.round((Date.now() - started) / 1000);
    if (result.ok) console.info(`[gemini] ${model}: answered in ${seconds}s`);
    if (result.ok || !handsOver(result.failure)) return result;
    console.warn(`[gemini] ${model}: ${describe(result.failure)} after ${seconds}s — trying the next model`);
    failures.push(result.failure);
    return undefined;
  };

  for (let pass = 0; pass < 2 && pending.length > 0; pass++) {
    if (pass > 0) await new Promise((resolve) => setTimeout(resolve, BUSY_PAUSE_MS));
    const busy: string[] = [];
    for (const model of pending) {
      const result = await attempt(model);
      if (result) return result;
      if (isBusy(failures.at(-1)!)) busy.push(model);
    }
    pending = busy;
  }

  for (const model of options.lastResort ?? []) {
    const result = await attempt(model);
    if (result) return result;
  }

  return { ok: false, failure: mostUseful(failures) };
}

/**
 * The failure to show when every model declined. Busy beats the rest because
 * it is the one worth retrying in a few minutes; then a per-minute limit; a
 * spent daily allowance only when that is all there was.
 */
function mostUseful(failures: GeminiFailure[]): GeminiFailure {
  const busy = failures.find(isOverloaded);
  if (busy) return busy;
  const rateLimits = failures.filter((f) => f.kind === 'rate_limit');
  if (rateLimits.length > 0) {
    return rateLimits.reduce((a, b) => (a.retryAfterSeconds <= b.retryAfterSeconds ? a : b));
  }
  return failures.find((f) => f.kind === 'quota_exhausted') ?? failures.at(-1)!;
}

function describe(failure: GeminiFailure): string {
  switch (failure.kind) {
    case 'http':
      return failure.status === 503
        ? 'busy (503)'
        : failure.status === TIMED_OUT
          ? `no answer within ${MODEL_TIMEOUT_MS / 1000}s`
          : `HTTP ${failure.status}`;
    case 'rate_limit':
      return `per-minute limit (${failure.quotaId})`;
    case 'quota_exhausted':
      return `daily allowance spent (${failure.quotaValue ?? '?'} a day)`;
    default:
      return failure.kind;
  }
}

async function callModel(
  { apiKey, prompt, maxOutputTokens, thinking }: CallOptions,
  model: string,
  schema: unknown,
): Promise<CallResult> {
  const signal = AbortSignal.timeout(MODEL_TIMEOUT_MS);
  const timedOut = (): CallResult => ({
    ok: false,
    failure: { kind: 'http', status: TIMED_OUT, message: `${model} did not answer within ${MODEL_TIMEOUT_MS / 1000}s.` },
  });

  let response: Response;
  try {
    response = await fetch(`${ENDPOINT}/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          ...(schema ? { responseMimeType: 'application/json', responseSchema: schema } : {}),
          maxOutputTokens,
          ...(thinking ? {} : { thinkingConfig: thinkingOff(model) }),
        },
      }),
      signal,
    });
  } catch (cause) {
    if (signal.aborted) return timedOut();
    return {
      ok: false,
      failure: { kind: 'http', status: 0, message: cause instanceof Error ? cause.message : 'Network error' },
    };
  }

  const body = await response.json().catch(() => null);
  if (signal.aborted) return timedOut();

  if (response.status === 429) {
    return { ok: false, failure: classifyQuota(body) };
  }
  if (!response.ok) {
    const message = body?.error?.message ?? `Gemini returned ${response.status}`;
    return { ok: false, failure: { kind: 'http', status: response.status, message } };
  }

  const candidate = body?.candidates?.[0];
  const blockReason = body?.promptFeedback?.blockReason;
  if (blockReason || candidate?.finishReason === 'SAFETY') {
    return { ok: false, failure: { kind: 'blocked', reason: blockReason ?? 'SAFETY' } };
  }
  if (candidate?.finishReason === 'MAX_TOKENS') {
    return { ok: false, failure: { kind: 'truncated' } };
  }

  // Thought summaries, when present, arrive as parts flagged `thought`; they
  // are not the answer.
  const raw: string = (candidate?.content?.parts ?? [])
    .filter((part: { thought?: boolean }) => !part.thought)
    .map((part: { text?: string }) => part.text ?? '')
    .join('');

  const usage: GeminiUsage = {
    promptTokens: body?.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: body?.usageMetadata?.candidatesTokenCount ?? 0,
    thinkingTokens: body?.usageMetadata?.thoughtsTokenCount ?? 0,
  };

  return { ok: true, raw, usage, model };
}

function classifyQuota(body: unknown): GeminiFailure {
  const details = (body as { error?: { details?: unknown[] } })?.error?.details ?? [];

  let quotaId = '';
  let quotaValue: string | undefined;
  let retryAfterSeconds = 30;

  for (const detail of details as Record<string, unknown>[]) {
    const type = String(detail['@type'] ?? '');
    if (type.endsWith('QuotaFailure')) {
      const violation = (detail.violations as Record<string, string>[] | undefined)?.[0];
      quotaId = violation?.quotaId ?? '';
      quotaValue = violation?.quotaValue;
    }
    if (type.endsWith('RetryInfo')) {
      const parsed = Number.parseFloat(String(detail.retryDelay ?? '').replace(/[^0-9.]/g, ''));
      if (Number.isFinite(parsed) && parsed > 0) retryAfterSeconds = Math.ceil(parsed);
    }
  }

  if (/PerDay/i.test(quotaId)) {
    return { kind: 'quota_exhausted', quotaId, quotaValue };
  }
  return { kind: 'rate_limit', retryAfterSeconds, quotaId, quotaValue };
}

/** Maps a failure onto an HTTP status and a sentence the interface can show. */
export function failureResponse(failure: GeminiFailure): { status: number; body: Record<string, unknown> } {
  switch (failure.kind) {
    case 'rate_limit':
      return {
        status: 429,
        body: {
          error: 'rate_limit',
          retryAfterSeconds: failure.retryAfterSeconds,
          message: `Gemini allows ${failure.quotaValue ?? 'a few'} requests a minute on the free tier. Retrying in ${failure.retryAfterSeconds}s.`,
        },
      };
    case 'quota_exhausted':
      return {
        status: 429,
        body: {
          error: 'quota_exhausted',
          message: `The Gemini daily free quota${failure.quotaValue ? ` (${failure.quotaValue} requests a day for this model)` : ''} is used up. It resets at midnight Pacific.`,
        },
      };
    case 'blocked':
      return {
        status: 422,
        body: { error: 'blocked', message: 'Gemini declined to answer this rule. Try rewording it.' },
      };
    case 'truncated':
      return {
        status: 502,
        body: { error: 'truncated', message: 'The response was cut off before it finished.' },
      };
    case 'malformed':
      return {
        status: 502,
        body: { error: 'malformed', message: 'Gemini returned something that could not be read.' },
      };
    case 'config':
      return { status: 500, body: { error: 'config', message: failure.message } };
    case 'http':
      if (failure.status === 503 || failure.status === TIMED_OUT) {
        return {
          status: 503,
          body: {
            error: 'overloaded',
            message:
              "Google's free Gemini servers are too busy right now. This is not your daily allowance running out. Wait a few minutes and try again.",
          },
        };
      }
      return { status: 502, body: { error: 'upstream', message: failure.message } };
  }
}

export function configFailure(cause: unknown): GeminiFailure {
  if (cause instanceof EnvError) return { kind: 'config', message: cause.message };
  return { kind: 'http', status: 0, message: cause instanceof Error ? cause.message : 'Unknown error' };
}
