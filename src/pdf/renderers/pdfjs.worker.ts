/**
 * The PDF.js worker, preceded by polyfills for built-ins it needs (see
 * polyfills/modern.ts). Bundled from the extension package like every script.
 */
import '../../polyfills/modern';
import 'pdfjs-dist/build/pdf.worker.min.mjs';
