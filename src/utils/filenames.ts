/** Safe output file names. Original files are never overwritten: every output gets a new name. */
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

export function sanitizeFileName(name: string, fallback = 'document'): string {
  let clean = name
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex -- intentionally removing control characters
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, '');
  if (!clean || RESERVED.test(clean)) clean = fallback;
  return clean.slice(0, 120).trim();
}

export function baseName(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
  return sanitizeFileName(stem);
}

/** e.g. outputName("Report.pdf", "compressed") → "Report-compressed.pdf" */
export function outputName(inputName: string, suffix: string, extension = 'pdf'): string {
  const stem = baseName(inputName);
  return `${stem}${suffix ? `-${sanitizeFileName(suffix)}` : ''}.${extension}`;
}
