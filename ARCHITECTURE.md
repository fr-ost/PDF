# Architecture

Unique PDF is a Manifest V3 Chrome extension built with React 19, TypeScript (strict), Tailwind CSS
4 and Vite 8. All PDF work happens locally: PDF.js (Apache-2.0) renders and extracts text, and
`@cantoo/pdf-lib` (an actively maintained MIT fork of pdf-lib with encryption support) creates and
modifies documents inside a Web Worker.

## Extension surfaces

| Surface | File | Purpose |
| --- | --- | --- |
| Full app tab | `app.html` → `src/entries/app.tsx` | The complete application (hash-routed). |
| Toolbar popup | `popup.html` → `src/entries/popup.tsx` | Quick links to tools and recent tasks. |
| Options page | `options.html` → `src/entries/options.ts` | Redirects to the app's Settings. |
| Service worker | `src/background/index.ts` → `background.js` | Opens/focuses the app tab (command `open-app`, first install). Never touches documents. |

The manifest is generated from `scripts/manifest.ts` at build time so the version always matches
`package.json`. Permissions: `storage` only.

## Source layout

```
src/
  app/                  App shell, router (hash + leave guard), pages
  components/
    ui/                 Design-system primitives (Button, Form, Dialog, Toast, Feedback…)
    tool/               Tool workflow components (ToolShell, Dropzone, PageGrid, PageCanvas,
                        FileGrid, PasswordPrompt, TaskPanels)
  features/             One folder per tool + shared hooks (page workspace, previews)
    registry.ts         Tool catalogue (only shipped, tested tools are listed)
  hooks/                useFileList, useTask, useHotkeys, useTheme
  pdf/
    engines/            PDF processing (pdf-lib) — worker only
    workers/            Worker entry, method table, typed RPC client, transfer helper
    renderers/          PDF.js setup, document registry, rendering, thumbnail cache
    adapters/           Browser image codec (createImageBitmap + OffscreenCanvas), image prep
    *.ts                Pure, dependency-free modules shared by UI and engines
                        (pageRanges, imageLayout, placement, redaction, winAnsi, paper…)
  services/             storage, settings, history, file intake, export/download, zip
  styles/               Tailwind entry and design tokens (light + dark)
tests/
  unit/                 Vitest: engines, pure logic, components (jsdom)
  e2e/                  Playwright: the built extension in Chromium
  store/                Store screenshot generator
  helpers/, fixtures/   Synthetic fixture generators, PDF.js verification helpers
scripts/                Manifest, asset copy, validation, notices, packaging, icons
```

### Bundle boundaries

`pdf-lib` must never be imported by UI code. Constants and math needed by both sides live in pure
modules (`src/pdf/paper.ts`, `imageLayout.ts`, `placement.ts`, `compressionPresets.ts`,
`pageNumberFormat.ts`, `redaction.ts`, `sniff.ts`, `winAnsi.ts`, `engines/annotations.ts`). The build
validator fails if pdf-lib appears in any chunk other than the processing worker.

Resulting production bundles (approximate, minified): processing worker ≈ 610 KB, PDF.js main
library ≈ 470 KB (loaded with the first tool), PDF.js worker ≈ 1.3 MB, React/UI ≈ 250 KB, each tool
chunk 5–30 KB. PDF.js character maps, standard fonts and WebAssembly decoders ship under
`vendor/pdfjs/` so rendering works offline.

## Data flow of a tool

```
 File chosen / dropped
        │  screenFiles(): magic-byte sniffing, size limits
        ▼
 useFileList ── FileEntry { file: File (disk-backed), status, pageCount, password? }
        │  PDF.js opens the file once (documents registry) → page count, password check,
        │  signature-field detection, lazily rendered thumbnails (LRU cache of JPEG blobs)
        ▼
 Tool UI (options, previews) ── useTask().run(...)
        │  toSource(): reads fresh bytes from the File
        ▼
 runInWorker(method, args)  ── new Worker per job; ArrayBuffers are transferred, not copied
        │  progress messages ⟶ ProgressBar;  Cancel ⟶ worker.terminate()
        ▼
 engines/*  (pdf-lib)  ── loadPdf → operation → pruneDocument → savePdf
        │
        ▼
 OutputFile { name, blob } ── ResultPanel ── saveOutput() (download or Save-As picker)
        └── addHistoryEntry() (names and sizes only, if enabled)
```

Documents are never stored in React state: entries hold `File` references and bytes are read only
when a job starts. PDF.js documents are destroyed and thumbnail URLs revoked when a file is removed
or the tool unmounts.

## PDF engine design

### Loading (`engines/load.ts`)

- Header sniffing (`%PDF-` within the first 1 KB), typed errors (`NOT_PDF`, `CORRUPT`, `ENCRYPTED`,
  `WRONG_PASSWORD`, `UNSUPPORTED`, …) that serialise across the worker boundary.
- Encrypted files: an empty user password is tried first (owner-password-only files open like in
  any viewer); otherwise the user's password is required. After decryption the `/Encrypt` entry is
  removed so output is never accidentally half-encrypted.
- `updateMetadata: false` so pdf-lib does not silently rewrite metadata; tools stamp Producer and
  ModDate explicitly (metadata editing and sanitising do not).

### Universal page assembler (`engines/assemble.ts`)

A *plan* is a list of `{ source, page, rotate }`. Two strategies:

- **In place** (`assembleInPlace`) — the first source is the base document; foreign pages are
  copied in (grouped per source so shared resources are copied once), the page tree is rebuilt flat
  (`pageTree.ts` pushes inherited `Resources/MediaBox/CropBox/Rotate` down first), rotations are
  applied. Bookmarks, forms, tags and metadata of the base survive. Used by Rotate, Reorder, Delete
  and Organize.
- **New** (`assembleNew`, `splitDocument`) — a fresh document receives copied pages. Used by Merge,
  Split and Extract. `splitDocument` loads the source once for all parts.

### Pruning (`engines/prune.ts`)

pdf-lib writes every object it knows, including ones nothing references. Before every save, a
reachability walk from the trailer (`Root`, `Info`, and `Encrypt` only when encrypting):

- replaces references to page objects that are no longer in the page tree with `null`
  (outline/link destinations, annotation `/P`), so removed pages cannot stay alive indirectly;
- drops link annotations pointing to removed pages and form fields whose widgets were only on
  removed pages;
- deletes every unreachable object — including stale cross-reference streams, superseded
  incremental-update objects and pages pulled in by pdf-lib's deep copier.

This is what makes "Delete pages" and "Redact" genuinely remove content from the output file
(verified by byte-level unit tests).

### Coordinate systems (`engines/geometry.ts`)

Tools that place content work in **display space**: the visible box (CropBox ∩ MediaBox) after the
page's `/Rotate`, in points. `displayToUserMatrix` maps y-up display space to user space for all four
rotations, so "top-left" is always the corner the user sees, and text stays upright on rotated pages.
The UI uses the same space (PDF.js viewport at scale 1, y-down) and converts with `y_up = H − y`.

### Compression (`engines/compress.ts`)

1. Remove page thumbnails and `/PieceInfo` private data (optionally metadata).
2. For each image XObject: skip masks, non-8-bit, decode arrays, colour-key masks, CMYK/Indexed/
   special colour spaces and non-JPEG/Flate filters. Compute the largest page dimension that uses
   the image (walking Form XObjects) and downsample to the preset DPI; Flate images have PNG/TIFF
   predictors undone; flat-colour graphics (≤ 256 colours) stay lossless. Re-encode as JPEG via the
   injected `ImageCodec` and keep the result only if ≥ 10 % smaller.
3. Merge byte-identical streams (common after merging), prune, deflate uncompressed streams and
   re-deflate weak Flate streams, write object streams.

The optional "maximum compression" rasterises pages with PDF.js in the UI and rebuilds a PDF from
JPEGs (with an explicit warning that text becomes non-searchable).

### Secure redaction (`engines/redact.ts`, `features/security/RedactTool.tsx`)

1. Marks: drawn boxes, search matches (PDF.js text items → boxes in display space, padded), or whole
   pages.
2. Each marked page is rendered by PDF.js at 150–300 DPI and the boxes are painted into the pixels.
3. The worker inserts a new page containing only that image, deletes the original page, optionally
   rebuilds an invisible text layer from text items that lie **entirely outside** all boxes, and
   optionally removes metadata, XMP, bookmarks, attachments, document scripts and tags.
4. Pruning deletes the original page's content streams, fonts and images from the file.
5. The UI re-opens the output with PDF.js and extracts text: any text intersecting a box aborts the
   export; search terms still present elsewhere are reported.

### Editor (`features/editor`)

Objects (`engines/annotations.ts`) are stored in display space and rendered as SVG over the PDF.js
canvas with the same geometry helpers the exporter uses (`pointsToSvgPath`, arrow heads, font ascent
tables), so the preview matches the output. Undo/redo keeps snapshots with checkpoint/commit for
continuous gestures. Export draws everything inside a display-space transform with pdf-lib
(standard fonts, SVG paths, ellipses, blend-mode highlights, embedded images).

## Rendering and performance

- PDF.js parses in its own worker; pages render to canvas in chunks. Thumbnails render only when
  scrolled into view (IntersectionObserver), at most three at a time, and are cached as JPEG blob
  URLs in an LRU (600 entries) that is evicted per document.
- Page grids use `content-visibility: auto` so large documents stay responsive (a 300-page document
  renders fewer than 120 thumbnails initially; verified by an E2E test).
- Canvas sizes are clamped to Chrome's limits (16 384 px per side, 100 MP) with a user notice.
- All pdf-lib work runs in a dedicated worker per job; buffers are transferred, and terminating the
  worker on cancel frees its memory immediately.

## Security model (summary)

Strict CSP (`script-src 'self' 'wasm-unsafe-eval'`, `connect-src 'self' blob: data:`,
`object-src 'none'`), no remote code, no document scripting, typed and sanitised handling of
untrusted metadata, magic-byte validation of every input. See [SECURITY.md](SECURITY.md).
