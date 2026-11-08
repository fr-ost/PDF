# Features

Every tool below is implemented, available in the interface and covered by automated tests. All
processing is local; every tool creates a **new** file and never modifies the original.

Common to all tools: drag and drop (onto the drop zone, onto tool cards, or onto the home screen,
which suggests a tool), file-type validation from file contents, size limits with clear messages,
password prompt for encrypted PDFs (password kept in memory only), page thumbnails, progress with
**Cancel**, success panel with output name, size, page count, Download / Open / ZIP, recent-task
history (file names and sizes only), confirmation before leaving a tool with selected files, and a
warning when a digitally signed PDF would lose its signatures.

## Organize

### Merge PDF
- Add many PDFs (drop or browse), see first-page previews, page counts and sizes.
- Reorder by drag and drop, by keyboard, with ◀ ▶ buttons, or *Sort by name*; remove files.
- Output name configurable. Page sizes and orientation are preserved exactly.
- Bookmarks and interactive form fields from sources are not carried over (stated in the UI).

### Split PDF
- **Every page** → one PDF per page.
- **Custom ranges** → each comma-separated range becomes a file (`1-3, 4-6, 7-`, `odd`, `even`, `last`).
- **Equal parts** → every N pages.
- **At selected pages** → click pages where a new file should begin.
- Live preview of resulting files; validation messages such as “Page 12 doesn’t exist — this
  document has 10 pages.” Download all as ZIP or save files individually.

### Organize pages
- Combine pages from several PDFs in one grid (colour-coded by source file).
- Drag to reorder (moving the whole selection when a selected page is dragged), rotate, delete,
  select all/none/invert/odd/even, reset, extract the selection as a new PDF.
- Output keeps the first file's bookmarks and forms.

### Rotate PDF
- Rotate individual pages (hover buttons), the selection, or all pages by 90°, 180°, 270°.
- Thumbnails preview the rotation instantly. Rotation is lossless (sets `/Rotate`).

### Reorder pages
- Thumbnail organizer with drag and drop, keyboard reordering (Space to lift, arrows, Space to drop,
  with screen-reader announcements), multi-select move to start/end, reverse, reset.
- Bookmarks and form fields are preserved.

### Delete pages
- Click pages or type a range to mark them; marked pages are dimmed with a “Delete” badge.
- Confirmation dialog listing the pages; at least one page must remain.
- Deleted pages are removed completely from the file (content, fonts, images); links to them are
  removed.

### Extract pages
- Select pages visually or by range (kept in sync).
- Output as **one PDF** or **one file per page** (ZIP).

## Convert

### Compress PDF
- Levels: **Light** (only images above 300 DPI), **Balanced** (≈150 DPI, recommended),
  **Strong** (≈100 DPI, stronger JPEG).
- Real techniques: image downsampling/re-encoding (only when it helps), duplicate stream merging,
  removal of unused objects, thumbnails and private app data, stream deflation, compact object
  streams. Optional metadata removal.
- Shows original size, compressed size, bytes saved and percentage, plus what was optimised.
  If the result is not smaller, the UI says so and recommends keeping the original.
- **Maximum compression** (opt-in) converts pages to images at a chosen DPI and quality, with an
  explicit warning that text will no longer be selectable or searchable.

### Images to PDF
- JPEG, PNG, WebP, GIF, BMP and AVIF; multiple images, previews, drag to reorder.
- Page size A3, A4, A5, Letter, Legal, *Same as image* or custom (mm); orientation auto/portrait/
  landscape; margins none/small/medium/large/custom; *Fit to page* or *Original size*; aspect ratio
  always preserved; live layout preview.
- JPEGs are embedded without re-encoding (no quality loss) and EXIF orientation is applied
  losslessly; PNG transparency is preserved; other formats are converted (PNG if transparent,
  otherwise high-quality JPEG). Images above 20 000 px per side or 150 MP are rejected.

### PDF to images
- PNG or JPEG (quality slider), 72–600 DPI, all or selected pages, preview strip of results,
  single download or ZIP. Pages that would exceed browser canvas limits are exported at the maximum
  safe resolution with a notice.

## Edit

### Edit PDF
- Tools: select/move/resize, text (font family, size, bold, italic, underline, colour, opacity,
  multi-line), freehand pen, highlighter (multiply blend), rectangle, ellipse (outline/fill), line,
  arrow, image overlay (PNG/JPEG/WebP/GIF/BMP), signature.
- Undo/redo (Ctrl+Z, Ctrl+Shift+Z/Ctrl+Y), duplicate (Ctrl+D), delete, arrow-key nudging,
  bring to front, zoom (fit width, 25–400 %), page navigation with thumbnails.
- Correct placement on rotated and cropped pages.
- **It adds content on top of the page; it does not edit text that already exists in the PDF.**
  Characters outside the standard fonts' WinAnsi set are detected and saving is blocked with an
  explanation.

### Sign PDF
- Opens the editor with a signature pad: draw with mouse, pen or touch, choose ink colour, undo
  strokes. The signature is stored as vector strokes (crisp at any zoom), placed and resized freely,
  and reusable within the session. Scanned signatures can be inserted as images.
- This is a visual signature, not a cryptographic digital signature (see ROADMAP).

### Watermark
- Text (font, bold/italic, size, colour) or image (size as % of page width).
- Opacity, rotation (−90° to 90°), 9 positions or tiled across the page, over or behind content,
  all pages or a page range, live preview per page.

### Page numbers
- 6 positions, formats `1`, `Page 1`, `1 of N`, `Page 1 of N`, prefix and suffix, starting number,
  font, bold, size, colour, distance from edge, pages: all / skip first / custom range; live preview.

## Security

### Protect PDF
- AES-256 encryption (PDF 2.0, revision 6), password confirmation and strength meter.
- Optional permissions (printing high/low/none, copying, editing, annotating, form filling,
  page assembly, accessibility) and an optional permissions password; if none is given, a random
  one is generated so restrictions cannot be lifted with the open password.
- Passwords are cleared from the form after use and never stored.

### Unlock PDF
- Detects the protection type (RC4 40/128-bit, AES-128, AES-256) and permissions.
- Requires the document password (or, for files that open without a password but carry
  restrictions, the owner password). No guessing, cracking or bypassing.

### Redact PDF
- Mark areas by drawing boxes, by searching text (match case, whole words; all pages at once), or
  by redacting whole pages. Search also finds words split across text runs or lines (“John” in
  bold followed by “Smith”) and works on vertical text. Move/resize/delete marks; preview the result.
- Black or white fill, 150/200/300 DPI for flattened pages.
- Removes the underlying content of marked pages (not a visual cover): pages with marks are
  replaced by flattened images with the areas painted over, and their original text, fonts,
  images, annotations, form fields (with their values), XFA form data and structure elements are
  deleted from the file. Links and bookmarks to a redacted page lead to its flattened version.
- Optional searchable text layer rebuilt only from text completely outside the marks.
- Optional removal of hidden information: metadata, XMP, bookmarks, attachments, document
  JavaScript, open actions, tags/structure tree.
- **Automatic verification**: the result is re-opened and its text extracted; if any text lies
  inside a marked area the export is refused. Search terms still found elsewhere are reported
  (with the same cross-run matching as the search).

### Edit metadata
- Shows title, author, subject, keywords, creator, producer, creation/modification dates, XMP
  presence, PDF version, page count and encryption.
- Edit or clear any field (dates via date-time pickers); existing XMP metadata is regenerated to
  match (PDF/A identification is kept). **Remove all metadata** strips the Info dictionary, XMP
  (also XMP attached to images, fonts and forms) and private application data. The saved values are read back from the new file and displayed.

## Unique AI

Unique AI is the AI assistant built into Unique PDF by Unique Labs. It runs on the AI built into
Chrome (Prompt and Summarizer APIs): the document text is extracted in the browser with PDF.js and
never sent to Unique Labs or any server.

### Chat with PDF
- Ask anything about a document in plain language. Answers stream in as they are written, with
  **clickable page citations** (“p. 4”) and a **Sources** row; on large screens a citation scrolls
  the page rail beside the chat to that page and highlights it, on phones it opens a page preview.
- Documents of any length: the text is split into page-tagged passages and indexed (BM25). Short
  documents are given to the model whole; for long ones the passages most relevant to the question
  (and the previous question, for follow-ups) are chosen to fit the model's context window, checked
  with the model's own token counter.
- Conversation: follow-up questions use the recent conversation; **Stop** (button or Escape),
  **Regenerate**, **Copy** (plain text with page references), **New chat**, **Export** (Markdown,
  `<name>-chat.md`), reply language (English, Spanish, Japanese).
- Suggested first questions adapt to the document (summary, key takeaways, numbers, dates and
  deadlines, obligations in contracts, findings in research papers, people and organizations).
- The model is told to answer only from the document, to cite pages, and never to follow
  instructions found inside the document. Answers are rendered as text (never HTML).
- First use: when Chrome reports the model as downloadable, the first question starts the one-time
  setup (progress shown in the answer). Availability: desktop Chrome 138+ on Windows, macOS, Linux or
  Chromebook Plus with enough storage and memory (about 22 GB free disk space; a GPU with more than
  4 GB of memory, or 16 GB RAM and 4+ CPU cores).
- **Search mode (not AI)**: where Unique AI isn't available, the same chat returns the best-matching
  passages with the question's words highlighted and page links, labelled “Best matches · not AI”.
- Scanned PDFs without a text layer are detected and explained (OCR is on the roadmap).

### AI Summary
- Key points, TL;DR, teaser or headline; short, medium or long; English, Spanish or Japanese; an
  optional focus (“deadlines, costs and risks”); all pages or a page range.
- Long documents are split into parts that fit the model's input quota and combined (“summary of
  summaries”), with progress for each step. Cancel stops the job.
- The summary streams in as it is written. **Copy** puts plain text on the clipboard;
  **Download** saves Markdown (`<name>-summary.md`); **Regenerate** writes a new one.
- **Quick summary (no AI)**: on any device, key sentences are selected from the document by a
  simple statistical method and labelled “Key sentences · not AI”.
- AI output can be wrong: answers and summaries carry a reminder to check important details.

## Application

- **Home**: headline, hero drop zone with tool suggestions, featured AI Summary card, searchable
  tool grid with category filters; drop files on any tool card to open it with those files.
- **Command palette**: `Ctrl K` / `⌘ K` (or the search button) finds tools, pages and theme actions
  by name or keyword; full keyboard operation.
- **Recent files**: last 50 tasks (tool, input and output names, sizes, time), per-entry removal,
  clear all, toggle recording.
- **Themes**: light, dark or match the system, from the sidebar, popup or Settings (with a circular
  reveal animation). All animation is disabled when the system asks to reduce motion.
- **Settings**: theme (system/light/dark), default image format/DPI/JPEG quality, default page size,
  default compression level, “Ask where to save each file” (native Save dialog), history toggle,
  clear history, clear all local data, version.
- **About** and **Privacy** pages, open-source licence list, keyboard shortcuts.
- **Popup**: open the app, nine quick tools (Chat with PDF and AI Summary first), recent tasks,
  theme switch.
- **Phones and tablets**: the main action of a tool floats at the bottom of the screen while you
  scroll through pages; the editor and Redact have previous/next page buttons; page actions are
  always visible on touch screens; pages and files can be reordered by long-press dragging.
- **Speed**: the most used tools load in the background when the browser is idle and any tool
  starts loading when you point at it, so tools open instantly; thumbnails render newest-first.
- **Keyboard**: `Alt+Shift+P` open app tab, `Alt+Shift+U` open popup (configurable at
  `chrome://extensions/shortcuts`); full keyboard operation of dialogs, grids and forms.
- **Offline**: everything works without a network connection after installation.
