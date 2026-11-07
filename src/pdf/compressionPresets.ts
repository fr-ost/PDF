/** Compression presets (pure module shared by UI and engine). */
export type CompressionLevel = 'low' | 'balanced' | 'high';

export interface CompressionPreset {
  /** Images above this effective resolution are downsampled. */
  dpi: number;
  /** JPEG quality 0–1. */
  quality: number;
  /** Re-encode JPEG images even when no downsampling is needed. */
  recompressWithoutResize: boolean;
  /** Re-deflate existing Flate streams at maximum compression. */
  reDeflate: boolean;
}

export const COMPRESSION_PRESETS: Record<CompressionLevel, CompressionPreset> = {
  low: { dpi: 300, quality: 0.85, recompressWithoutResize: false, reDeflate: false },
  balanced: { dpi: 150, quality: 0.72, recompressWithoutResize: true, reDeflate: true },
  high: { dpi: 100, quality: 0.55, recompressWithoutResize: true, reDeflate: true },
};
