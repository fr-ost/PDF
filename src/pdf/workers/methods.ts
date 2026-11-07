/**
 * Every operation the processing worker can perform. Each method receives
 * plain, structured-cloneable arguments plus a progress reporter.
 */
import { assembleInPlace, assembleNew, splitDocument, type PagePlanItem, type ProgressFn } from '../engines/assemble';
import { compressPdf, type CompressOptions } from '../engines/compress';
import { applyEditorObjects } from '../engines/editorExport';
import type { EditorAsset, EditorObject } from '../engines/annotations';
import { imagesToPdf, rasterPagesToPdf, type EmbeddableImage, type ImagesToPdfOptions, type RasterPage } from '../engines/imagesToPdf';
import type { PdfSource } from '../engines/load';
import { readMetadata, writeMetadata, type EditableMetadata } from '../engines/metadata';
import { addPageNumbers, type PageNumberOptions } from '../engines/pageNumbers';
import { redactPdf, type RedactedPageInput, type RedactOptions } from '../engines/redact';
import { getSecurityInfo, protectPdf, unlockPdf, type ProtectOptions } from '../engines/security';
import { addWatermark, type WatermarkOptions } from '../engines/watermark';
import { browserImageCodec } from '../adapters/browserImageCodec';
import { prepareImage, reencodeImage, type RawImageInput } from '../adapters/imagePrep';
import { createZip, type ZipEntry } from '../../services/zip-service/zip';
import { PdfToolError } from '../errors';

async function embedImagesToPdf(images: RawImageInput[], options: ImagesToPdfOptions, report: ProgressFn): Promise<Uint8Array> {
  const prepared: EmbeddableImage[] = [];
  for (let i = 0; i < images.length; i++) {
    report((i / images.length) * 0.4, `Preparing ${images[i]!.name}`);
    prepared.push(await prepareImage(images[i]!));
  }
  try {
    return await imagesToPdf(prepared, options, (v, l) => report(0.4 + v * 0.6, l));
  } catch (err) {
    // Some unusual JPEG/PNG variants cannot be embedded directly; fall back to
    // decoding and re-encoding them with the browser.
    if (!(err instanceof PdfToolError) || err.code !== 'INVALID_INPUT' || !err.fileName) throw err;
    const fixed: EmbeddableImage[] = [];
    for (const img of prepared) {
      if (img.name === err.fileName) fixed.push(await reencodeImage({ name: img.name, bytes: img.bytes }, img.kind === 'png' ? 'image/png' : 'image/jpeg'));
      else fixed.push(img);
    }
    return imagesToPdf(fixed, options, (v, l) => report(0.4 + v * 0.6, l));
  }
}

export const workerMethods = {
  assembleInPlace: (a: { sources: PdfSource[]; plan: PagePlanItem[] }, r: ProgressFn) => assembleInPlace(a.sources, a.plan, r),
  assembleNew: (a: { sources: PdfSource[]; plan: PagePlanItem[] }, r: ProgressFn) => assembleNew(a.sources, a.plan, r),
  split: (a: { source: PdfSource; groups: number[][]; names: string[] }, r: ProgressFn) => splitDocument(a.source, a.groups, a.names, r),
  imagesToPdf: (a: { images: RawImageInput[]; options: ImagesToPdfOptions }, r: ProgressFn) => embedImagesToPdf(a.images, a.options, r),
  rasterToPdf: (a: { pages: RasterPage[] }, r: ProgressFn) => rasterPagesToPdf(a.pages, r),
  compress: (a: { source: PdfSource; options: CompressOptions }, r: ProgressFn) => compressPdf(a.source, a.options, browserImageCodec, r),
  watermark: (a: { source: PdfSource; options: WatermarkOptions }, r: ProgressFn) => addWatermark(a.source, a.options, r),
  pageNumbers: (a: { source: PdfSource; options: PageNumberOptions }, r: ProgressFn) => addPageNumbers(a.source, a.options, r),
  editorExport: (a: { source: PdfSource; objects: EditorObject[]; assets: Record<string, EditorAsset> }, r: ProgressFn) =>
    applyEditorObjects(a.source, a.objects, a.assets, r),
  protect: (a: { source: PdfSource; options: ProtectOptions }) => protectPdf(a.source, a.options),
  unlock: (a: { source: PdfSource }) => unlockPdf(a.source),
  securityInfo: (a: { source: PdfSource }) => getSecurityInfo(a.source),
  readMetadata: (a: { source: PdfSource }) => readMetadata(a.source),
  writeMetadata: (a: { source: PdfSource; values: EditableMetadata | null }) => writeMetadata(a.source, a.values),
  redact: (a: { source: PdfSource; pages: RedactedPageInput[]; options: RedactOptions }, r: ProgressFn) => redactPdf(a.source, a.pages, a.options, r),
  zip: (a: { entries: ZipEntry[] }) => Promise.resolve(createZip(a.entries)),
};

export type WorkerMethods = typeof workerMethods;
export type WorkerMethodName = keyof WorkerMethods;
export type WorkerArgs<M extends WorkerMethodName> = Parameters<WorkerMethods[M]>[0];
export type WorkerResult<M extends WorkerMethodName> = Awaited<ReturnType<WorkerMethods[M]>>;
