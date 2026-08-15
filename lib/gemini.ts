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
  | { kind: 'quota_exhausted'; quotaId: string }
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
  | { ok: true; value: unknown; raw: string; usage: GeminiUsage }
  | { ok: false; failure: GeminiFailure; raw?: string };

interface CallOptions {
  apiKey: string;
  model: string;
  prompt: string;
  schema: unknown;
  maxOutputTokens: number;
  /** Off for the pre-flight classifier, on for chapter reasoning. */
  thinking: boolean;
}

export async function generateJson(options: CallOptions): Promise<GeminiResult> {
  const { apiKey, model, prompt, schema, maxOutputTokens, thinking } = options;

  let response: Response;
  try {
    response = await fetch(`${ENDPOINT}/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: schema,
          maxOutputTokens,
          ...(thinking ? {} : { thinkingConfig: { thinkingBudget: 0 } }),
        },
      }),
    });
  } catch (cause) {
    return {
      ok: false,
      failure: { kind: 'http', status: 0, message: cause instanceof Error ? cause.message : 'Network error' },
    };
  }

  const body = await response.json().catch(() => null);

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

  const raw: string = (candidate?.content?.parts ?? [])
    .map((part: { text?: string }) => part.text ?? '')
    .join('');

  const usage: GeminiUsage = {
    promptTokens: body?.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: body?.usageMetadata?.candidatesTokenCount ?? 0,
    thinkingTokens: body?.usageMetadata?.thoughtsTokenCount ?? 0,
  };

  try {
    return { ok: true, value: JSON.parse(raw), raw, usage };
  } catch {
    return { ok: false, failure: { kind: 'malformed', raw }, raw };
  }
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
    return { kind: 'quota_exhausted', quotaId };
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
          message: 'The Gemini daily free quota is used up. It resets at midnight Pacific.',
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
        body: { error: 'malformed', message: 'Gemini returned something that was not valid JSON.' },
      };
    case 'config':
      return { status: 500, body: { error: 'config', message: failure.message } };
    case 'http':
      return { status: 502, body: { error: 'upstream', message: failure.message } };
  }
}

export function configFailure(cause: unknown): GeminiFailure {
  if (cause instanceof EnvError) return { kind: 'config', message: cause.message };
  return { kind: 'http', status: 0, message: cause instanceof Error ? cause.message : 'Unknown error' };
}
