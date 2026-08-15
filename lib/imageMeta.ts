/**
 * Flux Schnell takes no width or height and does not document its output size,
 * so the dimensions are read back off the bytes rather than assumed. Pure, so
 * it can be tested without a network call.
 */
export interface ImageSize {
  format: 'jpeg' | 'png' | 'unknown';
  width: number;
  height: number;
}

export function readImageSize(bytes: Uint8Array): ImageSize {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { format: 'png', width: view.getUint32(16), height: view.getUint32(20) };
  }

  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let i = 2;
    while (i < bytes.length - 8) {
      if (bytes[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = bytes[i + 1];
      const length = view.getUint16(i + 2);
      const isStartOfFrame =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isStartOfFrame) {
        return { format: 'jpeg', height: view.getUint16(i + 5), width: view.getUint16(i + 7) };
      }
      i += 2 + length;
    }
  }

  return { format: 'unknown', width: 0, height: 0 };
}
