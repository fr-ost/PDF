/**
 * PDF compression that preserves text and vector content.
 *
 * What this engine really does (no exaggerated claims):
 *  1. Recompresses eligible embedded raster images (8-bit Gray/RGB JPEG or
 *     Flate images) as JPEG, downsampling images whose resolution exceeds the
 *     target DPI. Each image is only replaced if the result is meaningfully
 *     smaller. Text, fonts and vector drawings are never rasterised.
 *     Images with masks-as-colour-keys, CMYK/Indexed/special colour spaces,
 *     non-8-bit depth, decode arrays, JPEG 2000, JBIG2 or CCITT are left as-is.
 *     Flat-colour graphics (few distinct colours) stay lossless.
 *  2. Removes duplicate identical streams (common in merged documents).
 *  3. Drops unreachable objects, page thumbnails and private app data
 *     (/PieceInfo, which can contain an entire copy of the source artwork).
 *  4. Deflates uncompressed streams and re-deflates weakly compressed ones.
 *  5. Writes compact cross-reference/object streams.
 *
 * Page rasterisation ("maximum compression") is a separate, explicitly opt-in
 * mode implemented by the UI with PDF.js; see rasterPagesToPdf.
 */
import {
  PDFArray,
  PDFDict,
  PDFName,
  PDFNull,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  PDFStream,
  decodePDFRawStream,
  type PDFDocument,
  type PDFObject,
} from '@cantoo/pdf-lib';
import { zlibSync } from 'fflate';
import { getPageGeometry } from './geometry';
import { readJpegHeader, stripExifSegments } from './imageFormats';
import { loadPdf, savePdf, type PdfSource } from './load';
import { pruneDocument } from './prune';
import type { ProgressFn } from './assemble';

import { COMPRESSION_PRESETS, type CompressionLevel, type CompressionPreset } from '../compressionPresets';
export { COMPRESSION_PRESETS, type CompressionLevel, type CompressionPreset };

export type CodecInput =
  | { kind: 'jpeg'; bytes: Uint8Array }
  | { kind: 'raw'; data: Uint8Array; width: number; height: number; components: 1 | 3 };

export interface ImageCodec {
  /** Decode, resample to width×height and encode as JPEG; null if undecodable. */
  toJpeg(input: CodecInput, width: number, height: number, quality: number): Promise<Uint8Array | null>;
}

export interface CompressOptions {
  level: CompressionLevel;
  removeMetadata: boolean;
}

export interface CompressReport {
  originalSize: number;
  outputSize: number;
  imagesFound: number;
  imagesRecompressed: number;
  duplicateStreamsRemoved: number;
  streamsCompressed: number;
  objectsRemoved: number;
}

const N = {
  Subtype: PDFName.of('Subtype'),
  Image: PDFName.of('Image'),
  Form: PDFName.of('Form'),
  Filter: PDFName.of('Filter'),
  DecodeParms: PDFName.of('DecodeParms'),
  DCTDecode: PDFName.of('DCTDecode'),
  FlateDecode: PDFName.of('FlateDecode'),
  Width: PDFName.of('Width'),
  Height: PDFName.of('Height'),
  BitsPerComponent: PDFName.of('BitsPerComponent'),
  ColorSpace: PDFName.of('ColorSpace'),
  ImageMask: PDFName.of('ImageMask'),
  Decode: PDFName.of('Decode'),
  Mask: PDFName.of('Mask'),
  SMask: PDFName.of('SMask'),
  DeviceRGB: PDFName.of('DeviceRGB'),
  DeviceGray: PDFName.of('DeviceGray'),
  ICCBased: PDFName.of('ICCBased'),
  N: PDFName.of('N'),
  Resources: PDFName.of('Resources'),
  XObject: PDFName.of('XObject'),
  Type: PDFName.of('Type'),
  Metadata: PDFName.of('Metadata'),
  Thumb: PDFName.of('Thumb'),
  PieceInfo: PDFName.of('PieceInfo'),
  Predictor: PDFName.of('Predictor'),
  Colors: PDFName.of('Colors'),
  Columns: PDFName.of('Columns'),
  Length: PDFName.of('Length'),
};

const keyOf = (ref: PDFRef) => `${ref.objectNumber} ${ref.generationNumber}`;

function num(obj: PDFObject | undefined): number | undefined {
  return obj instanceof PDFNumber ? obj.asNumber() : undefined;
}

/** For each image, the largest page dimension (pt) of any page that uses it. */
function computeImageLimits(doc: PDFDocument): { limits: Map<string, number>; fallback: number } {
  const limits = new Map<string, number>();
  let fallback = 0;
  const ctx = doc.context;
  for (const page of doc.getPages()) {
    const g = getPageGeometry(page);
    const dim = Math.max(g.width, g.height);
    fallback = Math.max(fallback, dim);
    const visited = new Set<string>();
    const walk = (resources: PDFObject | undefined, depth: number) => {
      const res = resources instanceof PDFRef ? ctx.lookup(resources) : resources;
      if (!(res instanceof PDFDict) || depth > 12) return;
      const xobjects = res.lookup(N.XObject);
      if (!(xobjects instanceof PDFDict)) return;
      for (const [, value] of xobjects.entries()) {
        if (!(value instanceof PDFRef)) continue;
        const key = keyOf(value);
        if (visited.has(key)) continue;
        visited.add(key);
        const xobj = ctx.lookup(value);
        if (!(xobj instanceof PDFStream)) continue;
        const subtype = xobj.dict.get(N.Subtype);
        if (subtype === N.Image) limits.set(key, Math.max(limits.get(key) ?? 0, dim));
        else if (subtype === N.Form) walk(xobj.dict.get(N.Resources), depth + 1);
      }
    };
    walk(page.node.Resources(), 0);
  }
  return { limits, fallback: fallback || 842 };
}

function collectMaskRefs(doc: PDFDocument): Set<string> {
  const masks = new Set<string>();
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFStream) || obj.dict.get(N.Subtype) !== N.Image) continue;
    for (const k of [N.SMask, N.Mask]) {
      const v = obj.dict.get(k);
      if (v instanceof PDFRef) masks.add(keyOf(v));
    }
  }
  return masks;
}

interface ColorInfo {
  components: 1 | 3;
  /** Keep the original /ColorSpace entry (RGB-like spaces only). */
  keepColorSpace: boolean;
}

function resolveColorSpace(doc: PDFDocument, value: PDFObject | undefined): ColorInfo | null {
  const cs = value instanceof PDFRef ? doc.context.lookup(value) : value;
  if (cs === N.DeviceRGB) return { components: 3, keepColorSpace: true };
  if (cs === N.DeviceGray) return { components: 1, keepColorSpace: false };
  if (cs instanceof PDFArray && cs.size() === 2 && cs.lookup(0) === N.ICCBased) {
    const profile = cs.lookup(1);
    const n = profile instanceof PDFStream ? num(profile.dict.lookup(N.N)) : undefined;
    if (n === 3) return { components: 3, keepColorSpace: true };
    if (n === 1) return { components: 1, keepColorSpace: false };
  }
  return null;
}

function singleFilter(dict: PDFDict): PDFName | null | undefined {
  const f = dict.lookup(N.Filter);
  if (f === undefined) return null;
  if (f instanceof PDFName) return f;
  if (f instanceof PDFArray && f.size() === 1) {
    const only = f.lookup(0);
    return only instanceof PDFName ? only : undefined;
  }
  return undefined; // chained filters: not handled
}

/** Reverses PNG (10–15) and TIFF (2) predictors for 8-bit samples. */
export function undoPredictor(data: Uint8Array, predictor: number, colors: number, columns: number): Uint8Array | null {
  if (predictor <= 1) return data;
  const bpp = colors;
  const rowLength = colors * columns;
  if (predictor === 2) {
    const out = data.slice();
    for (let row = 0; row + rowLength <= out.length; row += rowLength) {
      for (let i = bpp; i < rowLength; i++) out[row + i] = (out[row + i]! + out[row + i - bpp]!) & 0xff;
    }
    return out;
  }
  if (predictor < 10) return null;
  const stride = rowLength + 1;
  const rows = Math.floor(data.length / stride);
  const out = new Uint8Array(rows * rowLength);
  for (let r = 0; r < rows; r++) {
    const filter = data[r * stride]!;
    const src = r * stride + 1;
    const dst = r * rowLength;
    const prev = dst - rowLength;
    for (let i = 0; i < rowLength; i++) {
      const raw = data[src + i]!;
      const left = i >= bpp ? out[dst + i - bpp]! : 0;
      const up = r > 0 ? out[prev + i]! : 0;
      const upLeft = r > 0 && i >= bpp ? out[prev + i - bpp]! : 0;
      let value: number;
      switch (filter) {
        case 0: value = raw; break;
        case 1: value = raw + left; break;
        case 2: value = raw + up; break;
        case 3: value = raw + ((left + up) >> 1); break;
        case 4: {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          value = raw + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
          break;
        }
        default:
          return null;
      }
      out[dst + i] = value & 0xff;
    }
  }
  return out;
}

/** True for flat-colour artwork (charts, screenshots, logos) that JPEG would damage. */
export function looksLikeGraphic(data: Uint8Array, components: 1 | 3, pixelCount: number): boolean {
  const step = Math.max(1, Math.floor(pixelCount / 60000));
  const colors = new Set<number>();
  for (let p = 0; p < pixelCount; p += step) {
    const i = p * components;
    const c = components === 3 ? (data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]! : data[i]!;
    colors.add(c);
    if (colors.size > 256) return false;
  }
  return true;
}

function fnv1a(bytes: Uint8Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]!;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Merges byte-identical streams with identical dictionaries. Lossless. */
export function dedupeStreams(doc: PDFDocument): number {
  const ctx = doc.context;
  const buckets = new Map<string, { ref: PDFRef; stream: PDFRawStream }[]>();
  const replacement = new Map<string, PDFRef>();
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream) || obj.contents.length < 64) continue;
    const dict = obj.dict.clone(ctx);
    dict.delete(N.Length);
    const key = `${obj.contents.length}:${fnv1a(obj.contents)}:${dict.toString()}`;
    const bucket = buckets.get(key) ?? [];
    const match = bucket.find((b) => bytesEqual(b.stream.contents, obj.contents));
    if (match) replacement.set(keyOf(ref), match.ref);
    else {
      bucket.push({ ref, stream: obj });
      buckets.set(key, bucket);
    }
  }
  if (replacement.size === 0) return 0;
  const rewrite = (container: PDFDict | PDFArray) => {
    if (container instanceof PDFDict) {
      for (const [k, v] of container.entries()) {
        if (v instanceof PDFRef) {
          const r = replacement.get(keyOf(v));
          if (r) container.set(k, r);
        } else if (v instanceof PDFDict || v instanceof PDFArray) rewrite(v);
      }
    } else {
      for (let i = 0; i < container.size(); i++) {
        const v = container.get(i);
        if (v instanceof PDFRef) {
          const r = replacement.get(keyOf(v));
          if (r) container.set(i, r);
        } else if (v instanceof PDFDict || v instanceof PDFArray) rewrite(v);
      }
    }
  };
  for (const [, obj] of ctx.enumerateIndirectObjects()) {
    if (obj instanceof PDFStream) rewrite(obj.dict);
    else if (obj instanceof PDFDict || obj instanceof PDFArray) rewrite(obj);
  }
  const root = ctx.trailerInfo.Root;
  if (root instanceof PDFDict) rewrite(root);
  return replacement.size;
}

function deflateStreams(doc: PDFDocument, reDeflate: boolean): number {
  let count = 0;
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const dict = obj.dict;
    if (dict.get(N.Type) === N.Metadata) continue; // XMP should stay readable
    const filter = singleFilter(dict);
    try {
      if (filter === null && obj.contents.length > 128) {
        const compressed = zlibSync(obj.contents, { level: 9 });
        if (compressed.length < obj.contents.length * 0.95) {
          obj.updateContents(compressed);
          dict.set(N.Filter, N.FlateDecode);
          dict.delete(N.DecodeParms);
          count++;
        }
      } else if (reDeflate && filter === N.FlateDecode && !dict.has(N.DecodeParms) && obj.contents.length > 512) {
        const raw = decodePDFRawStream(obj).decode();
        const compressed = zlibSync(raw, { level: 9 });
        if (compressed.length < obj.contents.length * 0.97) {
          obj.updateContents(compressed);
          dict.set(N.Filter, N.FlateDecode);
          count++;
        }
      }
    } catch {
      // Undecodable stream: leave untouched.
    }
  }
  return count;
}

export function stripMetadata(doc: PDFDocument): void {
  const ctx = doc.context;
  const info = ctx.trailerInfo.Info;
  if (info instanceof PDFRef) ctx.delete(info);
  ctx.trailerInfo.Info = undefined;
  // XMP can be attached to the catalog, pages, images, form XObjects, fonts…
  for (const [, obj] of ctx.enumerateIndirectObjects()) {
    if (obj instanceof PDFDict) obj.delete(N.Metadata);
    else if (obj instanceof PDFStream) obj.dict.delete(N.Metadata);
  }
  doc.catalog.delete(N.Metadata);
}

export async function compressPdf(source: PdfSource, options: CompressOptions, codec: ImageCodec, progress: ProgressFn = () => undefined): Promise<{ bytes: Uint8Array; report: CompressReport }> {
  const preset = COMPRESSION_PRESETS[options.level];
  progress(0.02, 'Reading document');
  const { doc } = await loadPdf(source);
  const ctx = doc.context;

  for (const page of doc.getPages()) {
    page.node.delete(N.Thumb);
    page.node.delete(N.PieceInfo);
  }
  doc.catalog.delete(N.PieceInfo);
  if (options.removeMetadata) stripMetadata(doc);

  const { limits, fallback } = computeImageLimits(doc);
  const maskRefs = collectMaskRefs(doc);
  const images = ctx.enumerateIndirectObjects().filter(([, o]) => o instanceof PDFRawStream && o.dict.get(N.Subtype) === N.Image) as [PDFRef, PDFRawStream][];

  let imagesRecompressed = 0;
  for (let i = 0; i < images.length; i++) {
    const [ref, stream] = images[i]!;
    progress(0.05 + (i / Math.max(1, images.length)) * 0.75, `Optimising image ${i + 1} of ${images.length}`);
    try {
      if (await recompressImage(doc, ref, stream, preset, limits.get(keyOf(ref)) ?? fallback, maskRefs, codec)) imagesRecompressed++;
    } catch {
      // Any failure leaves the original image untouched.
    }
  }

  progress(0.82, 'Removing duplicate and unused data');
  const duplicateStreamsRemoved = dedupeStreams(doc);
  const { removedObjects } = pruneDocument(doc);
  progress(0.88, 'Compressing streams');
  const streamsCompressed = deflateStreams(doc, preset.reDeflate);
  progress(0.94, 'Saving');
  // Without stamping, a stripped document keeps no Info dictionary at all.
  const bytes = await savePdf(doc, { stamp: !options.removeMetadata });
  progress(1);
  return {
    bytes,
    report: {
      originalSize: source.bytes.length,
      outputSize: bytes.length,
      imagesFound: images.length,
      imagesRecompressed,
      duplicateStreamsRemoved,
      streamsCompressed,
      objectsRemoved: removedObjects,
    },
  };
}

async function recompressImage(
  doc: PDFDocument,
  ref: PDFRef,
  stream: PDFRawStream,
  preset: CompressionPreset,
  maxPageDimPt: number,
  maskRefs: Set<string>,
  codec: ImageCodec,
): Promise<boolean> {
  const dict = stream.dict;
  if (maskRefs.has(keyOf(ref))) return false;
  if (dict.lookup(N.ImageMask)?.toString() === 'true') return false;
  if (dict.has(N.Decode)) return false;
  if (dict.lookup(N.Mask) instanceof PDFArray) return false;
  const width = num(dict.lookup(N.Width));
  const height = num(dict.lookup(N.Height));
  const bpc = num(dict.lookup(N.BitsPerComponent));
  if (!width || !height || bpc !== 8) return false;
  if (width * height < 64 * 64 || stream.contents.length < 8 * 1024) return false;
  const color = resolveColorSpace(doc, dict.get(N.ColorSpace));
  if (!color) return false;
  const filter = singleFilter(dict);
  if (filter !== N.DCTDecode && filter !== N.FlateDecode) return false;
  if (filter === N.DCTDecode && dict.has(N.DecodeParms)) return false;

  const limitPx = Math.ceil((maxPageDimPt / 72) * preset.dpi);
  const longest = Math.max(width, height);
  const scale = longest > limitPx * 1.1 ? limitPx / longest : 1;
  if (scale === 1 && filter === N.DCTDecode && !preset.recompressWithoutResize) return false;

  let input: CodecInput;
  if (filter === N.DCTDecode) {
    // Browsers apply the EXIF orientation when decoding, but the PDF already
    // rotates the image with its placement matrix: decode it as stored.
    input = { kind: 'jpeg', bytes: (readJpegHeader(stream.contents)?.orientation ?? 1) !== 1 ? stripExifSegments(stream.contents) : stream.contents };
  } else {
    // /DecodeParms may be a dict or, with /Filter [/FlateDecode], a one-element array.
    const rawParms = dict.lookup(N.DecodeParms);
    if (rawParms instanceof PDFArray && rawParms.size() !== 1) return false;
    const parms = rawParms instanceof PDFArray ? rawParms.lookup(0) : rawParms;
    if (parms !== undefined && parms !== PDFNull && !(parms instanceof PDFDict)) return false;
    let data = decodePDFRawStream(stream).decode();
    if (parms instanceof PDFDict) {
      const predictor = num(parms.lookup(N.Predictor)) ?? 1;
      const colors = num(parms.lookup(N.Colors)) ?? 1;
      const columns = num(parms.lookup(N.Columns)) ?? 1;
      if (colors !== color.components || columns !== width) return false;
      const undone = undoPredictor(data, predictor, colors, columns);
      if (!undone) return false;
      data = undone;
    }
    if (data.length < width * height * color.components) return false;
    if (looksLikeGraphic(data, color.components, width * height)) return false;
    if (scale === 1 && !preset.recompressWithoutResize) return false;
    input = { kind: 'raw', data, width, height, components: color.components };
  }

  const targetW = Math.max(1, Math.round(width * scale));
  const targetH = Math.max(1, Math.round(height * scale));
  const jpeg = await codec.toJpeg(input, targetW, targetH, preset.quality);
  if (!jpeg || jpeg.length >= stream.contents.length * 0.9) return false;

  const newDict = dict.clone(doc.context);
  newDict.set(N.Filter, N.DCTDecode);
  newDict.delete(N.DecodeParms);
  newDict.set(N.Width, PDFNumber.of(targetW));
  newDict.set(N.Height, PDFNumber.of(targetH));
  newDict.set(N.BitsPerComponent, PDFNumber.of(8));
  if (!color.keepColorSpace) newDict.set(N.ColorSpace, N.DeviceRGB);
  newDict.delete(N.Length);
  doc.context.assign(ref, PDFRawStream.of(newDict, jpeg));
  return true;
}
