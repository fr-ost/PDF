/** Collects transferable ArrayBuffers so large binaries move between threads without copying. */
export function collectTransferables(value: unknown, out: Set<ArrayBuffer> = new Set(), depth = 0): Set<ArrayBuffer> {
  if (depth > 8 || value === null || typeof value !== 'object') return out;
  if (ArrayBuffer.isView(value)) {
    const buffer = value.buffer;
    if (buffer instanceof ArrayBuffer && value.byteOffset === 0 && value.byteLength === buffer.byteLength) out.add(buffer);
    return out;
  }
  if (value instanceof ArrayBuffer) {
    out.add(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectTransferables(item, out, depth + 1);
    return out;
  }
  for (const item of Object.values(value as Record<string, unknown>)) collectTransferables(item, out, depth + 1);
  return out;
}
