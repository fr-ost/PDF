/**
 * File intake: type detection from file contents (never trusting the
 * extension alone), size limits and friendly rejection reasons.
 */
import { hasPdfHeader } from '../../pdf/sniff';
import { sniffImageFormat } from '../../pdf/engines/imageFormats';
import { formatBytes } from '../../utils/format';

export type FileKind = 'pdf' | 'image';

/** Hard limit per file: beyond this, browsers routinely run out of memory. */
export const MAX_FILE_BYTES = 1024 * 1024 * 1024;
/** Above this size we warn that processing may be slow. */
export const LARGE_FILE_BYTES = 200 * 1024 * 1024;
export const MAX_FILES = 200;

export interface Rejection {
  name: string;
  reason: string;
}

export async function detectKind(file: File): Promise<FileKind | null> {
  const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  if (hasPdfHeader(head)) return 'pdf';
  if (sniffImageFormat(head)) return 'image';
  return null;
}

export const ACCEPT_ATTR: Record<FileKind, string> = {
  pdf: 'application/pdf,.pdf',
  image: 'image/jpeg,image/png,image/webp,image/gif,image/bmp,image/avif,.jpg,.jpeg,.png,.webp,.gif,.bmp,.avif',
};

export async function screenFiles(files: File[], accept: FileKind[], limit = MAX_FILES): Promise<{ accepted: { file: File; kind: FileKind }[]; rejected: Rejection[] }> {
  const accepted: { file: File; kind: FileKind }[] = [];
  const rejected: Rejection[] = [];
  for (const file of files) {
    if (accepted.length >= limit) {
      rejected.push({ name: file.name, reason: `Only ${limit} file${limit === 1 ? '' : 's'} can be added here.` });
      continue;
    }
    if (file.size === 0) {
      rejected.push({ name: file.name, reason: 'The file is empty.' });
      continue;
    }
    if (file.size > MAX_FILE_BYTES) {
      rejected.push({ name: file.name, reason: `The file is ${formatBytes(file.size)}; the maximum is ${formatBytes(MAX_FILE_BYTES)}.` });
      continue;
    }
    let kind: FileKind | null;
    try {
      kind = await detectKind(file);
    } catch {
      rejected.push({ name: file.name, reason: 'The file could not be read.' });
      continue;
    }
    if (!kind || !accept.includes(kind)) {
      const wanted = accept.map((k) => (k === 'pdf' ? 'a PDF file' : 'an image file (JPEG, PNG, WebP, GIF, BMP or AVIF)')).join(' or ');
      rejected.push({ name: file.name, reason: kind ? `This tool needs ${wanted}.` : `This doesn’t look like ${wanted}.` });
      continue;
    }
    accepted.push({ file, kind });
  }
  return { accepted, rejected };
}

export async function readBytes(file: Blob): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}
