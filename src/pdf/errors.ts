/**
 * Typed errors shared by the UI, the processing worker and the PDF engines.
 * Errors cross the worker boundary as plain objects, so everything here must
 * be serialisable.
 */
export type PdfErrorCode =
  | 'NOT_PDF'
  | 'CORRUPT'
  | 'ENCRYPTED'
  | 'WRONG_PASSWORD'
  | 'UNSUPPORTED'
  | 'TOO_LARGE'
  | 'INVALID_INPUT'
  | 'CANCELLED'
  | 'OUT_OF_MEMORY'
  | 'UNKNOWN';

export class PdfToolError extends Error {
  readonly code: PdfErrorCode;
  readonly fileName?: string;

  constructor(code: PdfErrorCode, message: string, fileName?: string) {
    super(message);
    this.name = 'PdfToolError';
    this.code = code;
    if (fileName !== undefined) this.fileName = fileName;
  }
}

export interface SerializedError {
  code: PdfErrorCode;
  message: string;
  fileName?: string;
}

export function serializeError(err: unknown): SerializedError {
  if (err instanceof PdfToolError) {
    return { code: err.code, message: err.message, ...(err.fileName ? { fileName: err.fileName } : {}) };
  }
  if (err instanceof RangeError || (err instanceof Error && /out of memory|allocation failed|array buffer allocation/i.test(err.message))) {
    return { code: 'OUT_OF_MEMORY', message: 'The browser ran out of memory while processing this file.' };
  }
  if (err instanceof DOMException && err.name === 'AbortError') {
    return { code: 'CANCELLED', message: 'Processing was cancelled.' };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { code: 'UNKNOWN', message: message || 'An unexpected error occurred.' };
}

export function deserializeError(data: SerializedError): PdfToolError {
  return new PdfToolError(data.code, data.message, data.fileName);
}

export function isCancelled(err: unknown): boolean {
  return err instanceof PdfToolError && err.code === 'CANCELLED';
}

export interface UserFacingError {
  title: string;
  message: string;
  recovery: string;
}

/** Converts any error into calm, actionable copy for the interface. */
export function describeError(err: unknown): UserFacingError {
  const e = err instanceof PdfToolError ? err : deserializeError(serializeError(err));
  const file = e.fileName ? `“${e.fileName}”` : 'This file';
  switch (e.code) {
    case 'NOT_PDF':
      return { title: 'Not a PDF file', message: `${file} doesn’t look like a PDF document.`, recovery: 'Choose a file that ends in .pdf and opens in a PDF viewer.' };
    case 'CORRUPT':
      return { title: 'The PDF could not be read', message: `${file} appears to be damaged or incomplete. ${e.message}`, recovery: 'Try downloading the file again, or re-save it from the app that created it.' };
    case 'ENCRYPTED':
      return { title: 'Password required', message: `${file} is password-protected.`, recovery: 'Enter the document’s password to continue.' };
    case 'WRONG_PASSWORD':
      return { title: 'Incorrect password', message: `The password for ${file.toLowerCase() === 'this file' ? 'this file' : file} is not correct.`, recovery: 'Check the password and try again. Passwords are case-sensitive.' };
    case 'UNSUPPORTED':
      return { title: 'Not supported', message: e.message, recovery: 'Try a different file or option.' };
    case 'TOO_LARGE':
      return { title: 'File too large', message: e.message, recovery: 'Split the document into smaller parts first, or close other tabs to free memory.' };
    case 'INVALID_INPUT':
      return { title: 'Check your settings', message: e.message, recovery: 'Adjust the highlighted options and try again.' };
    case 'CANCELLED':
      return { title: 'Cancelled', message: 'Processing was cancelled. Your files were not changed.', recovery: 'Start again whenever you’re ready.' };
    case 'OUT_OF_MEMORY':
      return { title: 'Not enough memory', message: 'The browser ran out of memory while processing. Your original files are untouched.', recovery: 'Close other tabs, use fewer or smaller files, or lower the output resolution.' };
    default:
      return { title: 'Something went wrong', message: e.message || 'An unexpected error occurred.', recovery: 'Try again. If the problem continues, the file may use a feature that isn’t supported yet.' };
  }
}
