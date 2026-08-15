/**
 * Seeds are derived, not random, and survive a cleared image store or an
 * export/reimport round trip.
 *
 * They no longer reproduce an image: Workers AI dropped `seed` from the
 * flux-1-schnell input schema, so it is recorded but not sent. The derivation is
 * kept because it is stable and because the parameter may return.
 * See docs/SCHEMA.md § Seeds.
 */
export function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function pageSeed(
  worldId: string,
  chapterNumber: number,
  pageIndex: number,
): number {
  return fnv1a(`${worldId}:${chapterNumber}:${pageIndex}`);
}
