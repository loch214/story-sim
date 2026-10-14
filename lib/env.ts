/**
 * Server-only. Never import this from a client component — it would leak keys
 * into the bundle.
 *
 * Model IDs come from .env.local, set from what Spike 0 verified is on the free
 * tier. They are never written inline.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new EnvError(`${name} is not set. Add it to .env.local and restart the dev server.`);
  }
  return value;
}

export class EnvError extends Error {}

function modelList(name: string): string[] {
  return (process.env[name] ?? '')
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);
}

export const geminiConfig = () => ({
  apiKey: requireEnv('GEMINI_API_KEY'),
  /**
   * GEMINI_MODEL first, then GEMINI_FALLBACK_MODELS (optional, comma-separated)
   * in order. The free tier sheds load with 503s and caps each model per day,
   * so one busy model must not sink the chapter. See lib/gemini.ts.
   */
  chapterModels: [requireEnv('GEMINI_MODEL'), ...modelList('GEMINI_FALLBACK_MODELS')],
  /**
   * GEMINI_LAST_RESORT_MODELS (optional): tried only after every chapter model
   * has had its second chance. A Lite model answers fast and is always there,
   * so as an ordinary fallback it wrote every story while the Flash models were
   * busy — and its stories ignored the rule. A book is better than an error,
   * but only once the better writers have really been unavailable.
   */
  lastResortModels: modelList('GEMINI_LAST_RESORT_MODELS'),
  preflightModel: requireEnv('GEMINI_PREFLIGHT_MODEL'),
});
