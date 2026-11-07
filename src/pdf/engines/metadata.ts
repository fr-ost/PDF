/** Reading, editing and removing document metadata (Info dictionary + XMP). */
import { PDFDict, PDFName, PDFRawStream, PDFRef, decodePDFRawStream, type PDFDocument } from '@cantoo/pdf-lib';
import { PdfToolError } from '../errors';
import { stripMetadata } from './compress';
import { loadPdf, savePdf, type PdfSource } from './load';

export interface PdfMetadata {
  title: string;
  author: string;
  subject: string;
  keywords: string;
  creator: string;
  producer: string;
  creationDate: string | null;
  modificationDate: string | null;
  hasXmp: boolean;
  pageCount: number;
  pdfVersion: string;
  wasEncrypted: boolean;
}

export type EditableMetadata = Pick<PdfMetadata, 'title' | 'author' | 'subject' | 'keywords' | 'creator' | 'producer'> & {
  creationDate: string | null;
  modificationDate: string | null;
};

export const MAX_METADATA_LENGTH = 2000;

function safe(value: string | undefined): string {
  if (!value) return '';
  // Strip control characters that some producers embed; keep printable text.
  // eslint-disable-next-line no-control-regex -- intentionally matching control characters
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, MAX_METADATA_LENGTH);
}

function safeDate(read: () => Date | undefined): string | null {
  try {
    const d = read();
    return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
  } catch {
    return null;
  }
}

function safeRead(read: () => string | undefined): string {
  try {
    return safe(read());
  } catch {
    return '';
  }
}

export function extractMetadata(doc: PDFDocument, wasEncrypted: boolean): PdfMetadata {
  const header = doc.context.header.toString();
  const version = /%PDF-(\d+\.\d+)/.exec(header)?.[1] ?? 'unknown';
  return {
    title: safeRead(() => doc.getTitle()),
    author: safeRead(() => doc.getAuthor()),
    subject: safeRead(() => doc.getSubject()),
    keywords: safeRead(() => doc.getKeywords()),
    creator: safeRead(() => doc.getCreator()),
    producer: safeRead(() => doc.getProducer()),
    creationDate: safeDate(() => doc.getCreationDate()),
    modificationDate: safeDate(() => doc.getModificationDate()),
    hasXmp: doc.catalog.has(PDFName.of('Metadata')),
    pageCount: doc.getPageCount(),
    pdfVersion: version,
    wasEncrypted,
  };
}

export async function readMetadata(source: PdfSource): Promise<PdfMetadata> {
  const { doc, wasEncrypted } = await loadPdf(source);
  return extractMetadata(doc, wasEncrypted);
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);
}

function readExistingXmp(doc: PDFDocument): string {
  const ref = doc.catalog.get(PDFName.of('Metadata'));
  const stream = ref instanceof PDFRef ? doc.context.lookup(ref) : undefined;
  if (!(stream instanceof PDFRawStream)) return '';
  try {
    return new TextDecoder().decode(decodePDFRawStream(stream).decode());
  } catch {
    return '';
  }
}

/** Builds a minimal XMP packet mirroring the Info dictionary (keeps PDF/A identification if present). */
export function buildXmp(values: EditableMetadata, previousXmp: string): string {
  const part = /pdfaid:part\s*=\s*["'](\d)["']|<pdfaid:part>(\d)<\/pdfaid:part>/.exec(previousXmp);
  const conformance = /pdfaid:conformance\s*=\s*["']([A-Za-z])["']|<pdfaid:conformance>([A-Za-z])<\/pdfaid:conformance>/.exec(previousXmp);
  const lines = [
    '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>',
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
    '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">',
  ];
  if (values.title) lines.push(`<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(values.title)}</rdf:li></rdf:Alt></dc:title>`);
  if (values.author) lines.push(`<dc:creator><rdf:Seq><rdf:li>${escapeXml(values.author)}</rdf:li></rdf:Seq></dc:creator>`);
  if (values.subject) lines.push(`<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(values.subject)}</rdf:li></rdf:Alt></dc:description>`);
  if (values.keywords) lines.push(`<pdf:Keywords>${escapeXml(values.keywords)}</pdf:Keywords>`);
  if (values.producer) lines.push(`<pdf:Producer>${escapeXml(values.producer)}</pdf:Producer>`);
  if (values.creator) lines.push(`<xmp:CreatorTool>${escapeXml(values.creator)}</xmp:CreatorTool>`);
  if (values.creationDate) lines.push(`<xmp:CreateDate>${escapeXml(values.creationDate)}</xmp:CreateDate>`);
  if (values.modificationDate) lines.push(`<xmp:ModifyDate>${escapeXml(values.modificationDate)}</xmp:ModifyDate>`);
  const p = part?.[1] ?? part?.[2];
  const c = conformance?.[1] ?? conformance?.[2];
  if (p) lines.push(`<pdfaid:part>${p}</pdfaid:part>`);
  if (c) lines.push(`<pdfaid:conformance>${c.toUpperCase()}</pdfaid:conformance>`);
  lines.push('</rdf:Description>', '</rdf:RDF>', '</x:xmpmeta>', '<?xpacket end="w"?>');
  return lines.join('\n');
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function writeMetadata(source: PdfSource, values: EditableMetadata | null): Promise<{ bytes: Uint8Array; metadata: PdfMetadata }> {
  const { doc, wasEncrypted } = await loadPdf(source);
  if (values === null) {
    stripMetadata(doc);
    // Also remove app-private data that commonly carries authoring details.
    doc.catalog.delete(PDFName.of('PieceInfo'));
    for (const page of doc.getPages()) page.node.delete(PDFName.of('PieceInfo'));
  } else {
    for (const [key, value] of Object.entries(values)) {
      if (typeof value === 'string' && value.length > MAX_METADATA_LENGTH) {
        throw new PdfToolError('INVALID_INPUT', `The ${key} field is too long (maximum ${MAX_METADATA_LENGTH} characters).`);
      }
    }
    const previousXmp = readExistingXmp(doc);
    const info = getOrCreateInfo(doc);
    const setOrDelete = (key: string, value: string, set: (v: string) => void) => {
      if (value.trim()) set(value.trim());
      else info.delete(PDFName.of(key));
    };
    setOrDelete('Title', values.title, (v) => doc.setTitle(v));
    setOrDelete('Author', values.author, (v) => doc.setAuthor(v));
    setOrDelete('Subject', values.subject, (v) => doc.setSubject(v));
    setOrDelete('Keywords', values.keywords, (v) => doc.setKeywords([v]));
    setOrDelete('Creator', values.creator, (v) => doc.setCreator(v));
    setOrDelete('Producer', values.producer, (v) => doc.setProducer(v));
    const created = parseDate(values.creationDate);
    const modified = parseDate(values.modificationDate);
    if (created) doc.setCreationDate(created);
    else info.delete(PDFName.of('CreationDate'));
    if (modified) doc.setModificationDate(modified);
    else info.delete(PDFName.of('ModDate'));

    if (doc.catalog.has(PDFName.of('Metadata'))) {
      const xmp = buildXmp({ ...values, creationDate: created?.toISOString() ?? null, modificationDate: modified?.toISOString() ?? null }, previousXmp);
      const stream = doc.context.stream(new TextEncoder().encode(xmp), { Type: 'Metadata', Subtype: 'XML' });
      doc.catalog.set(PDFName.of('Metadata'), doc.context.register(stream));
    }
  }
  const bytes = await savePdf(doc, { stamp: false });
  const reloaded = await loadPdf({ bytes, name: source.name });
  return { bytes, metadata: extractMetadata(reloaded.doc, wasEncrypted) };
}

function getOrCreateInfo(doc: PDFDocument): PDFDict {
  const ctx = doc.context;
  const existing = ctx.trailerInfo.Info ? ctx.lookup(ctx.trailerInfo.Info) : undefined;
  if (existing instanceof PDFDict) return existing;
  const dict = ctx.obj({});
  ctx.trailerInfo.Info = ctx.register(dict);
  return dict;
}

