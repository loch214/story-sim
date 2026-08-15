import { fnv1a } from './seed';

/**
 * Fixture-only artwork. Phase 2 spends zero Cloudflare neurons, but the page
 * layout cannot be judged against empty frames, so this synthesises a square
 * placeholder from the seed and the chapter palette.
 *
 * It deliberately obeys the composition clause — weight in the upper two
 * thirds, lower third left quiet for the text band — so what you are looking at
 * is the real layout problem, not a flattering one.
 */
export function demoArtwork(seed: number, palette: string[], shotType: string): Blob {
  const rand = mulberry32(seed);
  const pick = (i: number) => palette[i % palette.length];
  const size = 1024;
  const horizon = size * 0.66;

  const shapes: string[] = [];

  // Ground: the quiet lower third the text band sits over.
  shapes.push(`<rect x="0" y="${horizon}" width="${size}" height="${size - horizon}" fill="${pick(2)}" opacity="0.55"/>`);

  // Subject mass, always above the horizon.
  const count = 3 + Math.floor(rand() * 5);
  for (let i = 0; i < count; i++) {
    const w = 60 + rand() * 190;
    const h = 90 + rand() * (horizon - 120);
    const x = rand() * (size - w);
    const y = horizon - h;
    const fill = pick(3 + i);
    if (shotType === 'aerial' || shotType === 'diagram') {
      shapes.push(`<rect x="${x.toFixed(1)}" y="${(y + h * 0.4).toFixed(1)}" width="${w.toFixed(1)}" height="${(h * 0.5).toFixed(1)}" fill="${fill}" opacity="0.7"/>`);
    } else {
      shapes.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="4" fill="${fill}" opacity="0.75"/>`);
    }
  }

  // A sun or lamp, high in frame.
  shapes.push(`<circle cx="${(size * (0.2 + rand() * 0.6)).toFixed(1)}" cy="${(size * 0.16).toFixed(1)}" r="${(38 + rand() * 30).toFixed(1)}" fill="${pick(1)}" opacity="0.85"/>`);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
<rect width="${size}" height="${size}" fill="${pick(0)}"/>
${shapes.join('\n')}
<rect width="${size}" height="${size}" fill="none" stroke="${pick(4)}" stroke-width="3" opacity="0.35"/>
</svg>`;

  return new Blob([svg], { type: 'image/svg+xml' });
}

export function demoSeed(chapterId: string, pageIndex: number): number {
  return fnv1a(`demo:${chapterId}:${pageIndex}`);
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
