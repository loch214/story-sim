import { NextResponse } from 'next/server';
import { z } from 'zod';
import { geminiConfig } from '@/lib/env';
import { configFailure, failureResponse, generateJson } from '@/lib/gemini';
import { preflightSchemaForGemini } from '@/lib/geminiSchema';
import { buildPreflightPrompt } from '@/lib/prompts';
import { preflightSchema } from '@/lib/types';

export const maxDuration = 60;

const requestSchema = z.object({ input: z.string().min(1).max(300) });

/**
 * One cheap call before any chapter is generated. Gemini requests are abundant
 * and Cloudflare neurons are scarce, so spending a classifier call to avoid
 * wasting 2,073 neurons on a misread rule protects the scarce resource.
 */
export async function POST(request: Request) {
  const parsedRequest = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsedRequest.success) {
    return NextResponse.json(
      { error: 'bad_request', message: 'Send a rule between 1 and 300 characters.' },
      { status: 400 },
    );
  }

  let config;
  try {
    config = geminiConfig();
  } catch (cause) {
    const { status, body } = failureResponse(configFailure(cause));
    return NextResponse.json(body, { status });
  }

  const result = await generateJson({
    apiKey: config.apiKey,
    models: [config.preflightModel],
    prompt: buildPreflightPrompt(parsedRequest.data.input),
    schema: preflightSchemaForGemini,
    maxOutputTokens: 300,
    thinking: false,
  });

  if (!result.ok) {
    const { status, body } = failureResponse(result.failure);
    return NextResponse.json(body, { status });
  }

  const verdict = preflightSchema.safeParse(result.value);
  if (!verdict.success) {
    return NextResponse.json(
      { error: 'malformed', message: 'The classifier returned an unexpected shape.' },
      { status: 502 },
    );
  }

  // A usable verdict with no rule is not usable. Fail closed.
  if (verdict.data.verdict !== 'unusable' && !verdict.data.interpretedRule.trim()) {
    return NextResponse.json(
      {
        verdict: 'unusable',
        mode: 'rule',
        interpretedRule: '',
        reason: 'That did not resolve to a rule about how reality works.',
      },
      { status: 200 },
    );
  }

  return NextResponse.json(verdict.data);
}
