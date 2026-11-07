# Changelog

All notable changes to Unique PDF are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses semantic versioning.

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
