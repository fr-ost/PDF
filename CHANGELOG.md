# Changelog

All notable changes to Unique PDF are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses semantic versioning.

## [1.2.0] — 2026-11-08

### Added

- **Chat with PDF** (Unique AI): ask questions about a document and get streamed answers with
  clickable page citations, a Sources row and a page rail that jumps to the cited page (a page
  preview on phones). Works for documents of any length (page-tagged passages, BM25 retrieval that
  fits the model's context window), keeps the conversation for follow-ups, suggests first questions
  that fit the document, and offers Stop, Regenerate, Copy, New chat, Export (Markdown) and a reply
  language. Where the AI model isn't available, the same chat is a labelled non-AI passage search.
- Floating action bar on phones and tablets, previous/next page buttons in the editor and Redact,
  always-visible page actions and long-press dragging on touch screens.
- Tools load in the background when the browser is idle and when you point at them, so they open
  instantly.
- **Donate page**: the Unique Labs wallets (one EVM address for ETH, USDT, BNB, AVAX and other EVM
  chains, Solana, Bitcoin) with QR codes and Copy buttons, plus free ways to help. Reachable from
  the sidebar, footer, popup, About page and command palette.
- **Developer credit**: “Developed by Shahriar Ahmed” (with photo, linked to
  www.shahriarahmed.net) in the footer, an “About the developer” card on the About page, Settings
  and the Donate page.
- **Review prompt**: store installs are asked, after a few finished tasks, to rate Unique PDF 5
  stars on the Chrome Web Store (at most three times, “Maybe later” and “Don’t ask again”, nothing
  offered in return), with a permanent rating link in the sidebar, About and Donate pages.

### Changed

- The AI features are presented as **Unique AI** by Unique Labs; the AI tools section is now
  “Unique AI”, with Chat with PDF first. New manifest description.
- Minimum Chrome version 122. Small polyfills cover newer built-ins that PDF.js relies on, so PDFs
  also open in older supported Chrome versions.
- Thumbnails render newest-first and skip pages scrolled past; page grids no longer re-render every
  card on each keystroke; splitting documents with internal links is up to ~25× faster.
- Accessibility: every page, tool state, dialog, the phone layout and the toolbar popup pass an
  automated WCAG 2.2 AA audit (axe-core) in light and dark themes. Secondary text, buttons, badges
  and status colours meet 4.5:1 contrast; page cards keep their buttons beside (not inside) the
  draggable card; landmarks and headings are labelled and in order; visible labels match what
  screen readers announce; the popup has proper landmarks and a heading.

### Fixed

- Privacy: Redact now also removes form fields (and their values), XFA form data and structure
  elements of redacted pages; Extract and Split no longer carry field values of other pages; Delete
  pages removes annotations, alternate text and bookmarks of deleted pages reached through the
  structure tree, reply chains or outlines; “Remove all metadata” also removes XMP on images, fonts
  and forms; redaction search finds words split across text runs and lines and handles vertical
  text, and verification uses the same matching.
- PDF/A files: in-place tools failed on PDF/A-1 and Protect failed on all PDF/A files.
- Compress no longer corrupts images whose decode parameters are written as an array, and no longer
  rotates photos that carry an EXIF orientation.
- Protect: page labels, document language and other catalog strings are encrypted correctly, and
  so are strings in objects kept outside object streams (pages, stream dictionaries, objects with a
  non-zero generation number), which were readable without the password.
- Files with author restrictions (owner password only): page labels and the document language stay
  readable after editing, and Extract, Split, Merge and Organize keep the restrictions instead of
  producing an unrestricted copy.
- Comment replies stay attached to their comment after Extract, Split, Merge and Organize.
- Delete pages keeps structure elements (tables, paragraphs) that continue on kept pages, and
  removes alt text whose page is given only on a marked-content reference.
- Bookmarks: closed chapters stay closed after editing (counts are no longer rewritten).
- Page ranges: “1 5” means pages 1 and 5 (it was read as page 15).
- Files with author restrictions (owner password only) keep their restrictions after editing.
- Redacted pages no longer inherit rotation or crop box from the page tree.
- Usage-rights signatures (Reader extensions) are removed from edited files, avoiding an error in
  Adobe Reader.
- Interface: the password field is focused when the prompt opens (typing went to the Close button);
  “Skip to content” no longer opens “Page not found”; Back after leaving a tool returns to the right
  page; dropping a file outside a drop zone no longer replaces the app; the mobile menu is a proper
  modal (focus, Escape); dialogs don't close when a text selection ends outside them; number fields
  can be cleared and retyped; Retry in Edit metadata repeats the action that failed; Redo survives a
  click that changes nothing; page changes clear the selection (so Delete can't remove an unseen
  box); editor image URLs are released; result previews no longer leak documents; Watermark and Page
  numbers previews fit small screens and reset for a new file; the signature dialog fits phones;
  Extract applies a typed range to a new file; Organize file colours match the page stripes;
  command palette results stay grouped; editor shortcuts no longer fire while typing in other
  fields; a cancelled task can't reset a newer one; the toolbar button focuses the open app tab
  instead of opening another.
- Quick summary handles very large documents; underscores and asterisks inside words are kept,
  and bold next to Chinese, Japanese or Korean text works; Chinese and Japanese line breaks no
  longer insert spaces (Korean keeps them); streamed text can't be garbled by a repeated chunk.
- Chat with PDF: dense Chinese and Japanese pages are split into passages that fit the model's
  context; “(P1)” or “(p53)” are no longer taken for page references, while “[p. 3; p. 5]”,
  Spanish “[pág. 4]” and Japanese “（4ページ）” are; the page preview on phones shows the page;
  choosing a reply language the device can't use keeps the previous one (and the picker keeps
  focus); the second click of a double-click on Send no longer stops the answer; “Latest” no
  longer lingers after opening another PDF; date suggestions no longer count the word “may”.
- Split: “File N” badges update when the split mode changes. The command palette opens the best
  match on Enter (e.g. the Privacy page for “privacy”). Widening the window with the phone menu
  open no longer leaves the page unresponsive.

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
