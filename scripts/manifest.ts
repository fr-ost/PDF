/**
 * Single source of truth for the Chrome extension manifest (Manifest V3).
 * The version is taken from package.json so releases stay consistent.
 */
export interface ManifestOptions {
  version: string;
  development: boolean;
}

/**
 * Strict Content Security Policy for every extension page.
 * - Only bundled scripts may run ('self'); no remote code, no eval.
 * - 'wasm-unsafe-eval' is required so PDF.js can compile its bundled image
 *   decoders (JPEG 2000, JBIG2) and colour-management WebAssembly modules.
 * - connect-src only allows the extension's own files plus local blob/data
 *   URLs, so the browser itself blocks any attempt to send data to a server.
 */
export const EXTENSION_CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "worker-src 'self'",
  "connect-src 'self' blob: data:",
  "img-src 'self' blob: data:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "media-src 'none'",
].join('; ');

export function buildManifest({ version, development }: ManifestOptions): Record<string, unknown> {
  const icons = { '16': 'icons/icon-16.png', '32': 'icons/icon-32.png', '48': 'icons/icon-48.png', '128': 'icons/icon-128.png' };
  return {
    manifest_version: 3,
    name: development ? 'Unique PDF (Development)' : 'Unique PDF: Offline PDF Editor – AI Summary, Merge, Compress & Sign',
    short_name: 'Unique PDF',
    version,
    description:
      'Edit, merge, split & compress PDFs, convert JPG to PDF, sign, protect, redact and get AI summaries on-device. Nothing is uploaded.',
    icons,
    action: {
      default_title: 'Unique PDF',
      default_popup: 'popup.html',
      default_icon: icons,
    },
    background: {
      service_worker: 'background.js',
      type: 'module',
    },
    options_ui: {
      page: 'options.html',
      open_in_tab: true,
    },
    permissions: ['storage'],
    commands: {
      _execute_action: {
        suggested_key: { default: 'Alt+Shift+U' },
        description: 'Open the Unique PDF quick menu',
      },
      'open-app': {
        suggested_key: { default: 'Alt+Shift+P' },
        description: 'Open Unique PDF in a tab',
      },
    },
    content_security_policy: {
      extension_pages: EXTENSION_CSP,
    },
    minimum_chrome_version: '120',
    incognito: 'not_allowed',
  };
}
