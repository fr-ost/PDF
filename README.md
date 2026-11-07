# Unique PDF — Free PDF Toolkit by Unique Labs

**Free PDF tools without subscriptions, watermarks or file uploads.**

Unique PDF is a Chrome extension (Manifest V3) that brings 18 everyday PDF tools into a full-tab
application. Every file is processed locally in your browser — nothing is uploaded, there is no
account, no quota, no watermark and no tracking. It keeps working offline once installed.

> Unique Labs — *Useful technology. Accessible to everyone.*

---

## Contents

- [Features](#features)
- [Install in Chrome (unpacked)](#install-in-chrome-unpacked)
- [Development](#development)
- [Build, validate and package](#build-validate-and-package)
- [Architecture at a glance](#architecture-at-a-glance)
- [Privacy](#privacy)
- [Known limitations](#known-limitations)
- [Troubleshooting](#troubleshooting)
- [Documentation index](#documentation-index)

## Features

| Category | Tools |
| --- | --- |
| **Organize** | Merge · Split (every page, ranges, equal parts, at selected pages) · Organize workspace (multi-file reorder/rotate/delete) · Rotate · Reorder · Delete pages · Extract pages |
| **Convert** | Compress (image optimisation, deduplication, clean-up; optional page rasterisation) · Images → PDF (JPEG, PNG, WebP, GIF, BMP, AVIF) · PDF → images (PNG/JPEG, 72–600 DPI, ZIP) |
| **Edit** | Editor (text, freehand, highlights, rectangles, ellipses, lines, arrows, images, undo/redo, zoom) · Sign (drawn vector signatures) · Watermark (text or image, opacity, rotation, position, tiling, behind content) · Page numbers |
| **Security** | Protect (AES-256) · Unlock (with the real password only) · Redact (true removal + automatic verification) · Metadata (view, edit, remove; XMP kept in sync) |

Everything also includes: drag and drop everywhere (including onto tool cards), password prompts
for encrypted PDFs, progress with cancel, recent-task history (names and sizes only), light/dark
themes, keyboard operation, a quick-access popup and keyboard shortcuts
(`Alt+Shift+P` opens the app, `Alt+Shift+U` opens the popup).

See [FEATURES.md](FEATURES.md) for the precise behaviour of every tool.

## Install in Chrome (unpacked)

**Option A — prebuilt package (no tools needed):** a production build of the current version is
included at `release/unique-pdf-1.0.0.zip`. Extract it to a folder you will keep (for example
`Documents/unique-pdf`), then follow steps 2–5 below and select that folder.

**Option B — build it yourself:** run `npm install` and `npm run build`; the extension is written to
`dist/`.

1. Get the extension folder (Option A or B above).
2. Open `chrome://extensions` in Chrome (version 120 or later).
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the extracted folder (Option A) or `dist/` (Option B).
5. The Unique PDF tab opens automatically on first install. Afterwards, click the toolbar icon
   (pin it from the puzzle-piece menu) or press `Alt+Shift+P`.

To update after rebuilding, click the reload icon on the Unique PDF card in `chrome://extensions`.

## Development

Requirements: Node.js 22.13+ and npm 10+.

```bash
npm install
```

```bash
npm run dev
```

`npm run dev` serves the app at `http://localhost:5173/app.html` for fast UI iteration. In a normal
page Chrome extension APIs are unavailable, so settings and history fall back to `localStorage`.

To work against the real extension runtime, build continuously and reload the unpacked extension:

```bash
npm run watch
```

This writes a development build (with source maps) to `dist-dev/`; load that folder unpacked.

Useful scripts:

| Script | Purpose |
| --- | --- |
| `npm run typecheck` | Strict TypeScript check |
| `npm run lint` | ESLint (TypeScript + React hooks rules) |
| `npm test` | Unit and component tests (Vitest) |
| `npm run test:e2e` | End-to-end tests in Chromium with the built extension (run `npm run build` first) |
| `npm run screenshots` | Regenerates Chrome Web Store screenshots in `store-assets/screenshots/` |
| `npm run icons` | Regenerates the PNG icons |

## Build, validate and package

```bash
npm run build
```

This copies the PDF.js runtime assets, type-checks, bundles with Vite into **`dist/`**, writes
`THIRD_PARTY_NOTICES.txt` and runs `scripts/validate-build.mjs`, which fails the build if:

- the manifest is not valid MV3, versions disagree, or referenced files/icons are missing;
- any permission other than `storage`, any host permission, content script or web-accessible
  resource appears;
- the CSP allows remote scripts or `unsafe-eval`, or network connections beyond the extension;
- any bundle contains `eval`, `new Function`, CDN or telemetry URLs, inline scripts, source maps,
  test fixtures, the PDF.js scripting engine, or pdf-lib outside the processing worker.

To create the Chrome Web Store upload:

```bash
npm run package
```

The ZIP is written to `release/unique-pdf-<version>.zip`. Submission steps and listing text are in
[store-assets/STORE_LISTING.md](store-assets/STORE_LISTING.md). The version comes from
`package.json` — bump it there before packaging a new release.

## Architecture at a glance

```
UI (React, main thread)                     Processing worker (one per job)
┌───────────────────────────────┐          ┌────────────────────────────────┐
│ Tools ─ ToolShell ─ PageGrid  │  RPC     │ engines/  (pdf-lib fork)        │
│ PDF.js rendering & text       │ ───────► │ assemble · prune · compress ·   │
│ File intake (magic bytes)     │ transfer │ watermark · security · redact … │
│ Settings / history (storage)  │ ◄─────── │ adapters/ (OffscreenCanvas)     │
└───────────────────────────────┘ bytes    └────────────────────────────────┘
```

- PDF writing (pdf-lib) lives only in the worker; cancelling a job terminates its worker.
- PDF.js renders thumbnails and pages and extracts text; its scripting engine is not shipped.
- One universal page assembler powers merge/split/extract/reorder/rotate/delete/organize, and a
  reachability pruner guarantees removed pages are physically absent from output files.

Details: [ARCHITECTURE.md](ARCHITECTURE.md).

## Privacy

- No uploads, no servers, no analytics, no account. The CSP blocks network connections outright.
- One permission: `storage` (settings and the optional recent-task list of file names and sizes).
- Passwords live in memory only for the operation; documents are never stored.

Full policy: [PRIVACY.md](PRIVACY.md). Security model: [SECURITY.md](SECURITY.md).

## Known limitations

- **Existing text is not editable.** The editor adds content on top of pages. Added text,
  watermarks and page numbers use the 14 standard PDF fonts, which cover Western European
  characters (WinAnsi); other scripts are detected and blocked with a clear message.
- **Merge, split and extract** create new documents: bookmarks and interactive form fields of the
  sources are not carried over. Rotate, reorder, delete and organize keep them.
- **Redacted pages become images** (other pages are untouched). Text outside the boxes can stay
  searchable via an invisible layer, but characters outside WinAnsi are not reproduced there.
- **Compression** optimises 8-bit RGB/Gray JPEG and Flate images; CMYK, indexed, JPEG 2000, JBIG2
  and CCITT images are left untouched. Text-only PDFs usually shrink little.
- **Encryption**: output uses AES-256. Inputs using RC4 (40/128-bit), AES-128 or AES-256 standard
  security can be opened with their password; certificate-based encryption is not supported.
- **Digital signatures** in input files are invalidated by any change (a warning is shown).
- **Size**: files up to 1 GB are accepted; the practical limit depends on available memory.
  Very large or image-heavy documents can be slow.
- XFA forms are not rendered, and PDF/A conformance is not guaranteed after editing.

Roadmap items (OCR, Office conversion, form filling, digital signing, …) and their feasibility
are analysed in [ROADMAP.md](ROADMAP.md).

## Troubleshooting

| Problem | What to do |
| --- | --- |
| “Load unpacked” reports a manifest error | Make sure you selected the `dist/` folder (it contains `manifest.json`), not the repository root. Rebuild with `npm run build`. |
| Nothing happens when clicking Download | Check Chrome’s download settings; if “Ask where to save each file” is enabled in Unique PDF settings, a Save dialog should appear. |
| “Password required” for a file that opens elsewhere without one | The file has an empty user password with restrictions; it should open automatically. If not, the encryption type may be unsupported. |
| “The browser ran out of memory” | Close other tabs, split the document first, or lower the output resolution. |
| Thumbnails stay blank | The PDF may be damaged; try re-saving it from its original app. |
| Keyboard shortcuts do nothing | Another extension may use them. Change them at `chrome://extensions/shortcuts`. |
| E2E tests fail with “Run npm run build” | The tests load `dist/`; build first. |

## Documentation index

[ARCHITECTURE](ARCHITECTURE.md) · [FEATURES](FEATURES.md) · [ROADMAP](ROADMAP.md) ·
[PRIVACY](PRIVACY.md) · [SECURITY](SECURITY.md) · [TESTING](TESTING.md) ·
[CONTRIBUTING](CONTRIBUTING.md) · [CHANGELOG](CHANGELOG.md) ·
[Product metadata](product/product-metadata.json) · [Store listing](store-assets/STORE_LISTING.md)

---

© Unique Labs. Unique PDF is built on open-source software; see `THIRD_PARTY_NOTICES.txt` in the
build output for licenses.
