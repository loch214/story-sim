import type { Domain } from './types';

/**
 * One hue per domain, held constant across every world. The domain of an effect
 * is the same kind of fact in chapter 1 and chapter 9, so it gets the same
 * colour — unlike the per-world accent, which changes with the styleBible.
 */
export const DOMAIN_COLOUR: Record<Domain, string> = {
  society: '#e8b75d',
  technology: '#7fc8c0',
  economy: '#c98b6b',
  politics: '#9a8cc7',
  culture: '#e28a9b',
  environment: '#8fbf7a',
  conflict: '#d96a5b',
  science: '#7fa5d9',
};
