# Changelog

All notable changes to Unique PDF are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses semantic versioning.

## [1.1.0] — 2026-11-08

### Added

- **AI Summary** (new *AI tools* section): summaries written on the device by Chrome's built-in
  Summarizer API (Gemini Nano). Key points, TL;DR, teaser or headline; short, medium or long; English,
  Spanish or Japanese output; optional focus ("costs and risks"); all pages or a page range.
  Long documents are split into parts that fit the model and combined ("summary of summaries").
  The summary streams in as it is written and can be copied as plain text or downloaded as
  Markdown. Chrome downloads the model once on first use (progress shown); nothing is uploaded.
- **Quick summary (no AI)** for devices without the on-device model: key sentences selected by a
  simple statistical method, clearly labelled "Key sentences · not AI".
- Warning for PDFs without selectable text (scans), with a pointer to OCR on the roadmap.
- **Command palette** (`Ctrl K` / `⌘ K`, or the search button): jump to any tool, page or theme.
- Three-way theme switch (light, dark, system) in the sidebar and popup, with a circular reveal.

### Changed

- Extension name is now **“Unique PDF: Offline PDF Editor – AI Summary, Merge, Compress & Sign”**
  (short name “Unique PDF”) with an updated description.
- Complete visual redesign: Geist typeface, refined light and dark palettes, ambient background
  (soft light, grid and grain), category colours, animated gradient accents, spotlight cards, a new
  home page with a hero drop zone, page transitions (View Transitions API), staggered entrances,
  redesigned drop zones, result panels, form controls (segmented controls, switches, choice cards),
  toasts, dialogs, popup and icons. All motion respects “reduce motion”.
- Tool options panel fits the window on large screens: options scroll inside it, so the main action
  is always visible.
- The ambient background is still while a tool is open, so no frames are spent on decoration while
  documents are processed.

### Fixed

- Drag previews (page reordering) are drawn in a portal, so they can't be offset by animated
  ancestors.

## [1.0.0] — 2026-11-07

First release.

### Added

- Full-tab application with Home, Organize, Convert, Edit, Security, Recent files, Settings,
  About and Privacy sections; light and dark themes; toolbar popup; options page; keyboard
  shortcuts (`Alt+Shift+P`, `Alt+Shift+U`).
- Organize tools: Merge, Split (every page, ranges, equal parts, at selected pages), Organize
  workspace, Rotate, Reorder (drag, keyboard, multi-select), Delete pages, Extract pages.
- Convert tools: Compress (image optimisation, duplicate merging, clean-up, optional
  rasterisation), Images → PDF (JPEG, PNG, WebP, GIF, BMP, AVIF; lossless EXIF orientation),
  PDF → images (PNG/JPEG, 72–600 DPI, ZIP).
- Edit tools: Editor (text, freehand, highlight, shapes, lines, arrows, images, undo/redo, zoom),
  Sign (vector signatures), Watermark (text/image, tiling, behind content), Page numbers.
- Security tools: Protect (AES-256), Unlock (password required), Redact (true removal with
  automatic verification), Metadata (edit/remove, XMP sync).
- Password prompt for encrypted inputs (RC4 40/128, AES-128, AES-256), digital-signature warning,
  progress with cancel, recent-task history (names and sizes only), clear local data.
- Strict CSP blocking network access, `storage` as the only permission, build-time manifest and
  bundle validation, third-party notices, Chrome Web Store packaging.
- Unit, component and end-to-end test suites with synthetic fixtures.
