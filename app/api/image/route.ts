import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateImage, type ImageFailure } from '@/lib/cloudflare';
import { PROMPT_LIMITS } from '@/lib/types';

// Measured 1.7–4.5s per plate in Spike 0. Generous headroom, still bounded.
export const maxDuration = 60;

const requestSchema = z.object({
  prompt: z.string().min(1).max(PROMPT_LIMITS.total),
  seed: z.number().int(),
});

/**
 * Exactly one image per request. The client fires twelve of these through a pool
 * of three — a serverless function that loops over pages times out.
 */
export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'bad_request', message: `Send a prompt of 1–${PROMPT_LIMITS.total} characters and an integer seed.` },
      { status: 400 },
    );
  }

  const result = await generateImage(parsed.data.prompt, parsed.data.seed);

  if (!result.ok) {
    const { status, body } = failureResponse(result.failure);
    return NextResponse.json(body, { status });
  }

  return NextResponse.json(result.value);
}

function failureResponse(failure: ImageFailure): { status: number; body: Record<string, unknown> } {
  switch (failure.kind) {
    case 'quota_exhausted':
      return { status: 429, body: { error: 'quota_exhausted', message: failure.message } };
    case 'rate_limit':
      return {
        status: 429,
        body: { error: 'rate_limit', retryAfterSeconds: failure.retryAfterSeconds, message: failure.message },
      };
    case 'refused':
      return { status: 422, body: { error: 'refused', code: failure.code, message: failure.message } };
    // 500, not 400: the client sent a valid request, we sent a bad one upstream.
    case 'bad_request':
      return { status: 500, body: { error: 'bad_request', code: failure.code, message: failure.message } };
    case 'config':
      return { status: 500, body: { error: 'config', message: failure.message } };
    case 'upstream':
      return { status: 502, body: { error: 'upstream', message: failure.message } };
  }
}
