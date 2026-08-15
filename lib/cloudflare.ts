import { EnvError, requireEnv } from './env';
import { readImageSize } from './imageMeta';
import { neuronCost } from './prompt';
import { IMAGE_STEPS } from './types';

export const FLUX_MODEL = '@cf/black-forest-labs/flux-1-schnell';

/**
 * Cloudflare publishes no status or error codes distinguishing a rate limit
 * from an exhausted daily allowance, and forcing either costs more than it is
 * worth. So: classify what we can from the envelope, log the whole thing when
 * we cannot, and treat an unclassified 429 as a rate limit — the pool escalates
 * to a halt once its retries are spent, which is safe in both directions.
 *
 * See PLAN.md § Failure model.
 */
export type ImageFailure =
  | { kind: 'quota_exhausted'; message: string }
  | { kind: 'rate_limit'; retryAfterSeconds: number; message: string }
  | { kind: 'refused'; message: string; code?: number }
  /**
   * The request shape was rejected — our bug, not this prompt's. Prompt-independent,
   * so it will hit all twelve plates identically. Must halt, never degrade to
   * placeholders. See PLAN.md § Known issues (the `seed` incident).
   */
  | { kind: 'bad_request'; message: string; code?: number }
  | { kind: 'config'; message: string }
  | { kind: 'upstream'; status: number; message: string };

export interface ImageSuccess {
  image: string;
  neurons: number;
  width: number;
  height: number;
  bytes: number;
}

export type ImageResult = { ok: true; value: ImageSuccess } | { ok: false; failure: ImageFailure };

interface CloudflareEnvelope {
  success?: boolean;
  result?: { image?: string };
  errors?: { code?: number; message?: string }[];
}

export async function generateImage(prompt: string, seed: number): Promise<ImageResult> {
  let accountId: string;
  let token: string;
  try {
    accountId = requireEnv('CLOUDFLARE_ACCOUNT_ID');
    token = requireEnv('CLOUDFLARE_API_TOKEN');
  } catch (cause) {
    return {
      ok: false,
      failure: {
        kind: 'config',
        message: cause instanceof EnvError ? cause.message : 'Cloudflare is not configured.',
      },
    };
  }

  let response: Response;
  try {
    response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${FLUX_MODEL}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        // `seed` is deliberately NOT sent. Workers AI dropped it from the
        // flux-1-schnell input schema; passing it returns 400 code 5006
        // ("Additional or unevaluated properties '/seed' at '/' not allowed").
        // It is still recorded on the plate for provenance, but the endpoint
        // will not accept it, so plates are no longer reproducible by seed.
        // Verified live 2026-08-14. See PLAN.md § Known issues.
        body: JSON.stringify({ prompt, steps: IMAGE_STEPS }),
      },
    );
  } catch (cause) {
    return {
      ok: false,
      failure: { kind: 'upstream', status: 0, message: cause instanceof Error ? cause.message : 'Network error' },
    };
  }

  const raw = await response.text();
  let envelope: CloudflareEnvelope | null = null;
  try {
    envelope = JSON.parse(raw) as CloudflareEnvelope;
  } catch {
    /* non-JSON body — the raw text is logged below */
  }

  if (!response.ok || !envelope?.result?.image) {
    // Stringified deliberately: passing an object here logs as `{}` under
    // `next dev`, which cost us the entire envelope for a ten-plate refusal
    // cluster. See PLAN.md § Known issues. One line, greppable, self-contained.
    console.error(
      `[image] non-200 from Workers AI ${JSON.stringify({
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: raw.slice(0, 2000),
        promptHead: prompt.slice(0, 300),
        seed,
      })}`,
    );
    return { ok: false, failure: classify(response, envelope, raw) };
  }

  const bytes = base64ToBytes(envelope.result.image);
  const size = readImageSize(bytes);
  const header = response.headers.get('cf-ai-neurons');
  const measured = header ? Number.parseFloat(header) : Number.NaN;

  return {
    ok: true,
    value: {
      image: envelope.result.image,
      // The header is authoritative; the formula is only a fallback.
      neurons: Number.isFinite(measured) ? measured : neuronCost(size.width || 1024, size.height || 1024),
      width: size.width,
      height: size.height,
      bytes: bytes.length,
    },
  };
}

function classify(response: Response, envelope: CloudflareEnvelope | null, raw: string): ImageFailure {
  const error = envelope?.errors?.[0];
  const message = error?.message ?? raw.slice(0, 200) ?? `Workers AI returned ${response.status}`;

  if (response.status === 429) {
    const looksDaily = /neuron|daily|allocation|allowance|quota exceeded|out of credit/i.test(message);
    if (looksDaily) return { kind: 'quota_exhausted', message };

    const retryAfter = Number.parseInt(response.headers.get('retry-after') ?? '', 10);
    return {
      kind: 'rate_limit',
      retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 8,
      message,
    };
  }

  // An auth or account problem halts everything; it is not a per-plate issue.
  if (response.status === 401 || response.status === 403) {
    return { kind: 'config', message: `Cloudflare rejected the credentials: ${message}` };
  }

  // A malformed request is not a refusal. Ten plates were silently thrown away
  // as "safety refusals" when the real answer was that we were sending a field
  // the schema no longer accepts — every 4xx that was not 401/403/429 fell into
  // the refusal bucket, which is terminal and per-plate. Separate them: a bad
  // request is prompt-independent and must stop the run loudly.
  if (response.status === 400 && isBadInput(error?.code, message)) {
    return { kind: 'bad_request', message, code: error?.code };
  }

  // A genuinely rejected prompt is terminal for one plate and harmless to the rest.
  if (response.status >= 400 && response.status < 500) {
    return { kind: 'refused', message, code: error?.code };
  }

  return { kind: 'upstream', status: response.status, message };
}

/**
 * Workers AI reports input-schema violations as code 5006 with an `AiError: Bad
 * input` message. The code alone is the signal; the message patterns are a
 * belt-and-braces fallback for envelopes that arrive without one.
 */
function isBadInput(code: number | undefined, message: string): boolean {
  if (code === 5006) return true;
  return /bad input|unevaluated propert|additional propert|is not of a type|required propert/i.test(
    message,
  );
}

function base64ToBytes(base64: string): Uint8Array {
  return Uint8Array.from(Buffer.from(base64, 'base64'));
}
