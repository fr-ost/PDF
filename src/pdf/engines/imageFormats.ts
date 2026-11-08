/**
 * Image format detection and header parsing (no decoding).
 * Signatures are checked from the actual bytes, never trusted from file names.
 */
export type ImageFormat = 'jpeg' | 'png' | 'webp' | 'gif' | 'bmp' | 'avif';

export function sniffImageFormat(bytes: Uint8Array): ImageFormat | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'webp';
  if (ascii(bytes, 0, 4) === 'GIF8') return 'gif';
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return 'bmp';
  if (ascii(bytes, 4, 4) === 'ftyp' && /avi[fs]|mif1/.test(ascii(bytes, 8, 4))) return 'avif';
  return null;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let s = '';
  for (let i = offset; i < offset + length && i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return s;
}

export interface ImageHeaderInfo {
  width: number;
  height: number;
  /** EXIF orientation 1-8 (JPEG only; 1 = normal). */
  orientation: number;
}

export function readPngHeader(bytes: Uint8Array): ImageHeaderInfo | null {
  if (bytes.length < 24 || ascii(bytes, 12, 4) !== 'IHDR') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20), orientation: 1 };
}

export function readJpegHeader(bytes: Uint8Array): ImageHeaderInfo | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  let orientation = 1;
  let size: { width: number; height: number } | null = null;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = bytes[offset + 1]!;
    if (marker === 0xff) {
      offset++;
      continue;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      offset += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) break;
    const length = view.getUint16(offset + 2);
    if (length < 2 || offset + 2 + length > bytes.length) break;
    if (marker === 0xe1 && ascii(bytes, offset + 4, 4) === 'Exif') {
      orientation = readExifOrientation(view, offset + 10, offset + 2 + length) ?? 1;
    }
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof && offset + 9 <= bytes.length) {
      size = { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
    }
    offset += 2 + length;
  }
  return size ? { ...size, orientation } : null;
}

function readExifOrientation(view: DataView, tiffStart: number, end: number): number | null {
  if (tiffStart + 8 > end) return null;
  const order = view.getUint16(tiffStart);
  const little = order === 0x4949;
  if (!little && order !== 0x4d4d) return null;
  const ifdOffset = view.getUint32(tiffStart + 4, little);
  const ifd = tiffStart + ifdOffset;
  if (ifd + 2 > end) return null;
  const entries = view.getUint16(ifd, little);
  for (let i = 0; i < entries; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > end) return null;
    if (view.getUint16(entry, little) === 0x0112) {
      const value = view.getUint16(entry + 8, little);
      return value >= 1 && value <= 8 ? value : 1;
    }
  }
  return null;
}

/** Returns true if the EXIF orientation swaps width and height. */
export function orientationSwapsAxes(orientation: number): boolean {
  return orientation >= 5 && orientation <= 8;
}

/**
 * Removes EXIF (APP1 "Exif") segments so decoders don't apply the orientation
 * tag; used where the PDF already handles orientation in its placement matrix.
 */
export function stripExifSegments(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const parts: Uint8Array[] = [bytes.subarray(0, 2)];
  let offset = 2;
  let removed = false;
  while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1]!;
    if (marker === 0xff) {
      offset++; // fill byte
      continue;
    }
    if (marker === 0xda) break; // start of scan: the rest is image data
    const length = view.getUint16(offset + 2);
    if (length < 2 || offset + 2 + length > bytes.length) break;
    if (marker === 0xe1 && ascii(bytes, offset + 4, 4) === 'Exif') removed = true;
    else parts.push(bytes.subarray(offset, offset + 2 + length));
    offset += 2 + length;
  }
  if (!removed) return bytes;
  parts.push(bytes.subarray(offset));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
