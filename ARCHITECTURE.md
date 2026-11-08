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
  ai/                   On-device AI: Summarizer API wrapper (map-reduce for long documents),
                        text clean-up, chunking, non-AI extractive summary, safe Markdown parser
  app/                  App shell, router (hash + leave guard + view transitions), theme,
                        command palette, ambient background, pages
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
  styles/               Tailwind entry, design tokens (light + dark), motion and effects
  types/                Ambient types (Chrome's built-in AI APIs)
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
chunk 5–30 KB (AI Summary ≈ 24 KB). The Geist variable font (OFL) ships with the extension. PDF.js character maps, standard fonts and WebAssembly decoders ship under
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

### AI Summary (`src/ai`, `features/ai-summary`)

The tool extracts each page's text locally with PDF.js (`getTextContent`), cleans it
(`ai/text.ts`: de-hyphenation, line joins) and calls Chrome's built-in **Summarizer API**
(`ai/summarizer.ts`), which runs Gemini Nano on the device:

1. `availability()` decides the state shown to the user (ready, one-time download, unavailable, or
   API missing). `create()` is called synchronously inside the click handler, because Chrome needs
   a user activation to start the one-time model download; `downloadprogress` events drive the
   progress bar.
2. If the text exceeds ~80% of the instance's `inputQuota` (measured with `measureInputUsage`), it
   is packed into chunks (`ai/chunk.ts`), each summarised as key points by a helper instance, and the
   partial summaries are combined, recursively for up to four rounds ("summary of summaries").
3. The final pass streams with `summarizeStreaming`; `accumulateStream` accepts both delta and
   cumulative chunks. Every instance is destroyed afterwards; an `AbortSignal` cancels the job.
4. Output Markdown is parsed into headings, paragraphs and lists with inline bold/italic/code
   (`ai/markdown.ts`) and rendered as React text — never as HTML.

Without the API (or on unsupported hardware) the **Quick summary** uses `ai/extractive.ts`
(sentence scoring by word frequency with stop-word lists and a position boost), labelled as non-AI.
Unit tests drive the wrapper with a fake API; E2E tests inject a deterministic stand-in for
`window.Summarizer` (`tests/e2e/fakeAi.ts`) because headless Chromium has no model.

### Editor (`features/editor`)

Objects (`engines/annotations.ts`) are stored in display space and rendered as SVG over the PDF.js
canvas with the same geometry helpers the exporter uses (`pointsToSvgPath`, arrow heads, font ascent
tables), so the preview matches the output. Undo/redo keeps snapshots with checkpoint/commit for
continuous gestures. Export draws everything inside a display-space transform with pdf-lib
(standard fonts, SVG paths, ellipses, blend-mode highlights, embedded images).

## Interface and motion

- **Design tokens** live in `src/styles/index.css` (`@theme` for Tailwind colours; brand gradient,
  glow, grid and ambient colours as CSS variables). Dark mode is a `.dark` class on `<html>`
  (light, dark or system), applied before first paint.
- **View transitions:** route changes run inside `document.startViewTransition` (`app/viewTransition.ts`,
  `flushSync` so React commits inside the callback); the main column cross-fades and the sidebar's
  active pill morphs. Theme changes use a circular clip-path reveal from the click point. While a
  transition runs Chrome sends pointer events to `<html>`, so transitions are short (≤ 280 ms)
  and `<html data-transition>` marks them (tests wait for it to clear).
- **Animation rules:** entrance animations fill `backwards` only — a transform animation that keeps
  filling makes its element a containing block for `position: fixed` descendants (it offset the
  drag preview). The drag preview is portalled to `<body>` for the same reason. Decorative motion is
  compositor-only (transform/opacity); the ambient background pauses inside tools; everything is
  disabled under `prefers-reduced-motion`.
- **Command palette** (`app/shell/CommandPalette.tsx`): a modal `<dialog>` with a combobox/listbox,
  ranking by prefix, substring and keywords.

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
