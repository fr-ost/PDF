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
Chat with PDFs & get AI summaries. Edit, merge, split, compress, convert JPG to PDF, sign, protect & redact. Free, nothing uploaded.

**Category:** Productivity → Tools

**Description:**

> Unique PDF brings everyday PDF tools into your browser — completely free, with no uploads.
>
> UNIQUE AI — Chat with any PDF. Ask a question in plain language and Unique AI answers in seconds,
> with page references you can click to see where each answer comes from. Ask follow-ups, pick a
> suggested question, export the conversation. AI Summary turns a 100-page report into key points,
> a TL;DR or a headline. Your document is never uploaded. Needs desktop Chrome 138+ on a computer
> that supports Chrome's built-in AI; elsewhere chat works as a labelled passage search and a
> key-sentence summary (no AI) is available.
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
> answers and summaries can contain mistakes; check important details against the document.
>
> Unique PDF is developed by Shahriar Ahmed at Unique Labs — www.shahriarahmed.net

**Screenshots (1280×800):** generate with `npm run screenshots` →
`store-assets/screenshots/01-home.png` … `11-popup.png`. Suggested five: `01-home`,
`02-ai-chat`, `03-ai-summary`, `04-editor`, `08-ai-chat-dark`. The Unique AI shots are the real
interface driven by the same deterministic stand-ins for Chrome's AI that the E2E tests use
(headless Chromium has no model); the answers and summaries are sample content that matches the
sample document.

**Icon:** `public/icons/icon-128.png` (store tile source: `store-assets/icon-512.png`). These are
neutral product glyphs; replace with the official Unique Labs artwork when available
(`npm run icons` regenerates the PNGs from `scripts/generate-icons.mjs`).

**Promotional tiles:** optional; not included.

## 3. Privacy practices tab

**Single purpose:** "Unique PDF lets users view, organise, convert, edit, protect, redact, summarise
and ask questions about PDF files locally in the browser."

**Permission justifications:**

| Permission | Justification |
| --- | --- |
| `storage` | Saves the user's preferences (theme, default formats) and an optional list of recent file names and sizes on the device. |

No host permissions, no remote code.

**Remote code:** "No, I am not using remote code." All JavaScript and WebAssembly ship in the
package. (`wasm-unsafe-eval` is used only to compile the bundled PDF.js image decoders.)

**Data usage disclosures:** select **none** of the data types (the extension does not collect or
transmit user data). Unique AI (chat and summaries) uses Chrome's built-in AI APIs (Prompt API,
Summarizer API), which run in the browser; no document text, question or answer is sent to the
developer or any third party. Certify that data is not sold, not used for unrelated purposes and not used
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
