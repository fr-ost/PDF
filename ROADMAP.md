# Roadmap and feasibility analysis

Features listed here are **not** in the product yet and are intentionally kept out of the interface
until they can be delivered reliably, locally and with honest claims. Each entry records technical
feasibility, candidate libraries, local-processing options, licensing, performance constraints,
complexity and external dependencies.

Licensing notes use SPDX identifiers. "Bundle size" means added extension size, since all code and
data must ship inside the package (the extension downloads no executable code or models at runtime).
Chrome's built-in AI models are the one exception by design: they are downloaded, stored and run by
the browser itself, on the device, and the extension only calls the browser's API.

**Shipped:** AI Summary (1.1.0) and Chat with PDF (1.2.0), both part of Unique AI, built on Chrome's
built-in AI APIs, with long-document support and labelled non-AI fallbacks. See FEATURES.md.

## Summary

| Feature | Feasible locally? | Complexity | Main constraint | Recommendation |
| --- | --- | --- | --- | --- |
| Chat across several PDFs (Unique AI) | Yes, where Chrome's model is available | Medium | Context window, retrieval across files | Next minor release |
| Translate summaries, answers and text (Unique AI) | Yes, where Chrome's translator is available | Low–Medium | Language packs managed by Chrome | Next minor release |
| OCR | Yes | Medium | Size of language data, speed | Next major release |
| Searchable PDF (from scans) | Yes (with OCR) | Medium | Depends on OCR | Ship with OCR |
| PDF bookmarks / TOC editor | Yes | Medium | — | Next minor release |
| Preserve bookmarks on merge | Yes | Medium | Destination remapping | Next minor release |
| PDF form filling (AcroForm) | Yes | Medium | XFA not possible | Next minor release |
| Unicode text (custom fonts) | Yes | Medium | No complex-script shaping | Next minor release |
| Batch processing | Yes | Low–Medium | Memory per job | Next minor release |
| PDF comparison | Yes | Medium | Text order varies | Later |
| Digital signatures (PAdES) | Yes, partially | High | Certificates, timestamps need network | Later, optional |
| PDF → Word | Partially | High | Layout fidelity | Experimental only |
| Excel → PDF | Partially | Medium–High | Formatting/charts | Experimental only |
| Word → PDF | Not reliably | Very high | Needs a layout engine | Not planned for the extension |
| PowerPoint → PDF | Not reliably | Very high | Needs a rendering engine | Not planned for the extension |
| HTML → PDF | Not without extra permissions | High | Needs `debugger` permission or user print dialog | Not planned |

## Unique AI: next steps

Chat with PDF and AI Summary run on Chrome's built-in AI APIs (Prompt API, Summarizer API). Next:

- **Several documents in one chat** — the same retrieval over passages from several files, with
  citations that name the file and page.
- **Translate** — Chrome's Translator and Language Detector APIs translate in the browser; Chrome
  downloads language packs on demand. First for answers and summaries, then for text exports.
- **Answers from scans** — once OCR exists, scanned pages get a text layer that chat can read.
- **Constraints:** desktop Chrome only, hardware requirements (storage, GPU or RAM), and the output
  quality of a small model. Every AI feature keeps a clearly labelled non-AI path, and AI output is
  always rendered as text.
- **Not planned:** any cloud AI. Sending documents to a server would contradict the product's
  promise.

## OCR and searchable PDFs

1. **Feasibility:** Yes. Render each page with PDF.js, recognise with Tesseract, then add an
   invisible text layer. The redaction engine already contains the invisible-text-layer writer
   (`drawInvisibleText`) that would be reused.
2. **Libraries:** `tesseract.js` 7 (Apache-2.0) with `tesseract.js-core` (WASM, Apache-2.0);
   trained data from `tessdata_fast` (Apache-2.0).
3. **Local processing:** Fully local. Worker, core WASM and `.traineddata` must be bundled and
   referenced with extension URLs (`workerPath`, `corePath`, `langPath`) so nothing is downloaded at
   runtime. Needs `wasm-unsafe-eval`, which the CSP already allows.
4. **Licensing:** Apache-2.0 throughout — compatible.
5. **Performance:** ~1–4 s per A4 page at 300 DPI on a laptop; memory ~150–300 MB per worker.
   Bundle grows ~3 MB (core) + ~2–4 MB per `fast` language model (English ≈ 4 MB).
6. **Complexity:** Medium — language selection UI, per-page progress, accuracy expectations,
   handling of rotated scans (Tesseract OSD), Unicode text in the invisible layer (needs an
   embedded Unicode font, see "Unicode text").
7. **External dependencies:** None at runtime. Additional languages would be optional bundled
   packs or separate builds rather than downloads.

## Unicode text for editor, watermark and page numbers

1. **Feasibility:** Yes, by letting users pick a bundled or local TrueType/OpenType font.
2. **Libraries:** `@cantoo/fontkit` (MIT, already supported by the PDF library); Noto fonts (OFL).
3. **Local:** Fully local (fonts embedded and subset into the output).
4. **Licensing:** MIT/OFL — compatible.
5. **Performance:** Font parsing ~50–200 ms; bundle +0.5–1 MB per bundled font family.
6. **Complexity:** Medium. Complex scripts (Bengali, Devanagari, Arabic) need full OpenType shaping
   (GSUB/GPOS) that fontkit implements only partially; results must be verified per script before
   being advertised.
7. **External dependencies:** None.

## PDF bookmarks / table of contents

1. **Feasibility:** Yes. Read with PDF.js `getOutline()`, write `/Outlines` trees with pdf-lib's
   low-level API.
2. **Libraries:** existing PDF.js and pdf-lib fork.
3. **Local / licensing:** Local; no new licences.
4. **Performance:** Negligible.
5. **Complexity:** Medium — tree editor UI, destination picking, named destinations.
6. **Related:** carrying bookmarks through Merge/Split/Extract requires remapping destinations to
   copied pages; the pruning pass already handles dangling destinations safely.
7. **External dependencies:** None.

## PDF form filling (AcroForm)

1. **Feasibility:** Yes for AcroForm (text, check boxes, radio buttons, lists, combos). XFA forms
   cannot be supported reliably.
2. **Libraries:** pdf-lib form API (fill + regenerate appearances, flatten); PDF.js annotation layer
   for interactive rendering.
3. **Local / licensing:** Local; existing MIT/Apache libraries.
4. **Performance:** Light.
5. **Complexity:** Medium — appearance generation for non-Latin values needs embedded fonts.
6. **External dependencies:** None.

## Batch processing

1. **Feasibility:** Yes; engines already work on one document per worker job.
2. **Libraries:** existing.
3. **Local:** Yes; run jobs sequentially (or 2 in parallel) with per-file progress and ZIP output.
4. **Performance:** Bounded by memory; sequential processing keeps peak memory to one document.
5. **Complexity:** Low–Medium (UI for queues, per-file errors, cancel all).
6. **External dependencies:** None.

## PDF comparison

1. **Feasibility:** Yes for text and visual differences.
2. **Libraries:** PDF.js text extraction + `diff` (BSD-3-Clause) or `diff-match-patch`
   (Apache-2.0); pixel comparison on canvases for visual diff.
3. **Local / licensing:** Local; permissive licences.
4. **Performance:** Rendering two documents at moderate DPI; fine for typical documents.
5. **Complexity:** Medium — text reading order differs between producers; side-by-side UI.
6. **External dependencies:** None.

## Digital signatures (cryptographic, PAdES)

1. **Feasibility:** Partially. Signing with a user-provided PKCS#12 (.p12/.pfx) certificate is
   possible locally; trusted timestamps (RFC 3161) and revocation data need network access to a
   TSA/OCSP server, which conflicts with the no-network policy unless offered as an explicit
   opt-in with a host permission.
2. **Libraries:** PKI.js / asn1js (BSD-3-Clause) with WebCrypto, or `@signpdf/*` (MIT); the PDF
   fork supports incremental updates needed for signing.
3. **Local:** Signing and validation of the cryptographic signature locally; trust-chain validation
   needs bundled trust lists.
4. **Licensing:** Permissive (avoid node-forge's GPL option; use PKI.js).
5. **Performance:** Light.
6. **Complexity:** High — security-critical, certificate handling UX, long-term validation.
7. **External dependencies:** Optional TSA/OCSP endpoints.

## PDF → Word

1. **Feasibility:** Partial. Text-flow documents can be reconstructed (paragraphs, basic fonts,
   images); complex layouts (columns, tables, forms) lose fidelity.
2. **Libraries:** PDF.js (text with positions), `docx` (MIT) to write `.docx`.
3. **Local / licensing:** Local; MIT/Apache.
4. **Performance:** Moderate.
5. **Complexity:** High for acceptable quality (reading order, table detection).
6. **External dependencies:** None. Would ship only as clearly labelled "experimental".

## Excel → PDF

1. **Feasibility:** Partial — cell values and simple formatting can be laid out as tables;
   charts, conditional formatting and print areas are not reproduced faithfully.
2. **Libraries:** SheetJS Community Edition (Apache-2.0) for parsing; pdf-lib for layout.
3. **Local / licensing:** Local; Apache-2.0.
4. **Performance:** Fine for typical sheets; very large sheets need pagination limits.
5. **Complexity:** Medium–High.
6. **External dependencies:** None.

## Word → PDF and PowerPoint → PDF

1. **Feasibility in an extension:** Not reliable. Faithful conversion needs a complete office layout
   engine. The only realistic local option is LibreOffice compiled to WebAssembly (e.g. the
   ZetaOffice / LibreOffice WASM builds).
2. **Licensing:** MPL-2.0 (LibreOffice) — usable but adds notice obligations.
3. **Performance / size:** 50–150 MB of WASM and fonts, high memory use, multi-second start-up;
   too heavy for a Chrome extension package and Chrome Web Store expectations.
4. **Lighter alternatives:** `mammoth` (BSD-2-Clause) converts DOCX → HTML (semantic content
   only); rendering that HTML to PDF still needs a print engine (see HTML → PDF). Fidelity would
   be poor, so it will not be advertised.
5. **Decision:** Kept out of the product. Could be offered by a separate, optional desktop/web
   companion that still processes locally.

## HTML → PDF

1. **Feasibility:** Chrome can print to PDF, but an extension can only automate it through the
   `debugger` permission (`Page.printToPDF`), which shows a warning banner and is a sensitive
   permission. Without it, the user must use the browser print dialog.
2. **Decision:** Not planned; it would weaken the minimal-permission promise.

## Other improvements under consideration

- Persistent workspace (IndexedDB) so large sessions survive a reload — only with explicit opt-in.
- Compression of CMYK/Indexed images and JPEG 2000 recompression via PDF.js decoders.
- Optional off-main-thread page rendering using PDF.js 6 renderer workers.
- Localisation of the interface.
