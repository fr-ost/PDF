# Chrome Web Store submission guide

This package has **not** been published. Use this guide for the manual submission.

## 1. Build the package

```bash
npm ci
```

```bash
npm run lint && npm run typecheck && npm test
```

```bash
npm run package
```

Then run the end-to-end suite against the same build:

```bash
npm run test:e2e
```

Upload `release/unique-pdf-<version>.zip` (contents of `dist/`, `manifest.json` at the ZIP root).

## 2. Store listing

**Name (≤ 75 characters):** Unique PDF: Offline PDF Editor – AI Summary, Merge, Compress & Sign

The name comes from the manifest (`scripts/manifest.ts`); the dashboard shows it as is.

**Summary (≤ 132 characters, the manifest description):**
Edit, merge, split & compress PDFs, convert JPG to PDF, sign, protect, redact and get AI summaries on-device. Nothing is uploaded.

**Category:** Productivity → Tools

**Description:**

> Unique PDF brings everyday PDF tools into your browser — completely free, with no uploads.
>
> AI SUMMARY — Turn long PDFs into clear key points, a TL;DR, a teaser or a headline. Summaries are
> written on your computer by Chrome's built-in AI (Gemini Nano), so your document never leaves
> your device. Long reports are summarised in parts and combined. Needs desktop Chrome 138+ on a
> device that supports Chrome's on-device AI; elsewhere a clearly labelled key-sentence summary
> (no AI) is available.
>
> ORGANIZE — Merge PDFs, split by page or range, reorder, rotate, delete and extract pages, or
> combine pages from several files in one workspace.
>
> CONVERT — Compress PDFs (images are optimised while text stays searchable), turn JPG, PNG, WebP
> and other images into PDFs, and export pages as PNG or JPEG.
>
> EDIT — Add text, drawings, highlights, shapes, arrows, images and your signature. Add watermarks
> and page numbers.
>
> SECURITY — Protect PDFs with AES-256 passwords, remove passwords you know, edit or remove
> metadata, and permanently redact sensitive information with automatic verification.
>
> PRIVATE BY DESIGN — Your files are processed on your device and never uploaded. No account, no
> analytics, no ads, no watermarks, no limits. Works offline.
>
> Note: the editor adds new content; it does not change text that already exists in a PDF. AI
> summaries can contain mistakes; check important details against the document.

**Screenshots (1280×800):** generate with `npm run screenshots` →
`store-assets/screenshots/01-home.png` … `09-compress-result-dark.png` (`10-popup.png` shows the
toolbar popup). Suggested five: `01-home`, `02-ai-summary`, `03-editor`, `05-organize`,
`07-home-dark`. The AI Summary shots are the real interface driven by the same deterministic
stand-in for Chrome's model that the E2E tests use (headless Chromium has no model); the summary
text is sample content.

**Icon:** `public/icons/icon-128.png` (store tile source: `store-assets/icon-512.png`). These are
neutral product glyphs; replace with the official Unique Labs artwork when available
(`npm run icons` regenerates the PNGs from `scripts/generate-icons.mjs`).

**Promotional tiles:** optional; not included.

## 3. Privacy practices tab

**Single purpose:** "Unique PDF lets users view, organise, convert, edit, summarise, protect and
redact PDF files locally in the browser."

**Permission justifications:**

| Permission | Justification |
| --- | --- |
| `storage` | Saves the user's preferences (theme, default formats) and an optional list of recent file names and sizes on the device. |

No host permissions, no remote code.

**Remote code:** "No, I am not using remote code." All JavaScript and WebAssembly ship in the
package. (`wasm-unsafe-eval` is used only to compile the bundled PDF.js image decoders.)

**Data usage disclosures:** select **none** of the data types (the extension does not collect or
transmit user data). AI Summary uses Chrome's built-in on-device Summarizer API; no document text is
sent to the developer or any third party. Certify that data is not sold, not used for unrelated purposes and not used
for creditworthiness.

**Privacy policy URL:** publish the contents of `PRIVACY.md` on the Unique Labs website and link it.

## 4. Pre-submission checklist

- [ ] `package.json` version bumped and `CHANGELOG.md` updated
- [ ] `npm run build` validator passes (permissions, CSP, no remote code, no source maps)
- [ ] Unit and E2E suites pass on the packaged build
- [ ] Extension loaded unpacked from `dist/` and smoke-tested manually in current stable Chrome
- [ ] Screenshots regenerated for the current UI
- [ ] Official Unique Labs icon artwork in place (optional, recommended)
- [ ] Privacy policy published at a public URL
- [ ] Support contact (email or website) configured in the developer dashboard
