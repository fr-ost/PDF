# Privacy Policy — Unique PDF

*Effective date: 7 November 2026 · Applies to Unique PDF version 1.0.0 and later*

Unique PDF ("the extension") is a free PDF toolkit for Google Chrome made by Unique Labs. It is
designed so that your documents never leave your device.

## Summary

- **We do not collect, transmit, sell or share any personal data or document content.**
- All PDF and image processing happens locally in your browser.
- There are no accounts, no analytics, no telemetry, no advertising and no third-party services.

## How your files are handled

1. You choose files with the file picker or drag and drop. The browser gives the extension read
   access to those files only.
2. Files are processed inside the extension's own page and background workers using bundled code
   (PDF.js and pdf-lib). No file, page, text, image or password is sent to any server.
3. Results are kept in memory until you download them. Downloads are saved by Chrome to the
   location you choose. Your original files are only read, never modified.
4. When you close the tab or start over, in-memory data is released.

The extension's Content Security Policy only permits network connections to the extension's own
packaged files (`connect-src 'self' blob: data:`), so the browser itself blocks any attempt to send
data elsewhere.

## Data stored on your device

The extension uses Chrome's local extension storage (`chrome.storage.local`) for:

| Data | Purpose | How to remove |
| --- | --- | --- |
| Settings (theme, default formats, resolution, page size, compression level, save behaviour) | Remember your preferences | Settings → Clear all local data |
| Recent tasks (tool name, input/output **file names and sizes**, time) — only if enabled | Show your recent work | Recent files → Clear history, or turn off "Remember recent tasks" |

No document contents, passwords or page images are ever stored. Uninstalling the extension deletes
all of this data.

## Passwords

Passwords you enter to open, protect or unlock a PDF are held in memory only for the duration of the
operation, are never written to storage and are never transmitted.

## Permissions

| Permission | Why it is needed |
| --- | --- |
| `storage` | Save your settings and the optional recent-task list on your device. |

The extension requests **no host permissions**: it cannot read or change the websites you visit,
and it has no access to your browsing history, tabs' contents, cookies or downloads list.

## Children

The extension does not collect data from anyone, including children.

## Changes

If this policy changes, the updated version will be published with the extension and in this file,
with a new effective date. Material changes will never introduce data collection without a new
explicit opt-in.

## Contact

Questions about privacy can be directed to Unique Labs through the support contact listed on the
extension's Chrome Web Store page.
