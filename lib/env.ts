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

export const geminiConfig = () => ({
  apiKey: requireEnv('GEMINI_API_KEY'),
  chapterModel: requireEnv('GEMINI_MODEL'),
  preflightModel: requireEnv('GEMINI_PREFLIGHT_MODEL'),
});
