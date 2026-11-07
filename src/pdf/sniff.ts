/** PDF signature detection (pure; safe for the UI bundle). */
const HEADER_SCAN_BYTES = 1024;

export function hasPdfHeader(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length - 4, HEADER_SCAN_BYTES);
  for (let i = 0; i < limit; i++) {
    // "%PDF-"
    if (bytes[i] === 0x25 && bytes[i + 1] === 0x50 && bytes[i + 2] === 0x44 && bytes[i + 3] === 0x46 && bytes[i + 4] === 0x2d) {
      return true;
    }
  }
  return false;
}
