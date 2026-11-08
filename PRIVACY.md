# Privacy Policy — Unique PDF

*Effective date: 8 November 2026 · Applies to Unique PDF version 1.2.0 and later*

Unique PDF ("the extension") is a free PDF toolkit for Google Chrome made by Unique Labs and
developed by Shahriar Ahmed. It is designed so that your documents never leave your device.

## Summary

- **We do not collect, transmit, sell or share any personal data or document content.**
- All PDF and image processing happens locally in your browser, including Unique AI chat and
  summaries, which run on the AI model built into Chrome.
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

## Unique AI (chat and summaries)

Unique AI is built on the AI that is built into Chrome (the Prompt and Summarizer APIs). The text of
the PDF is extracted in your browser and processed by the AI model that Chrome runs on your
computer. The extension does not send the document, its text, your questions, the answers or
summaries to Unique Labs or any other server, and its network policy above still applies.

- **Model download:** the first time you use Unique AI on a device, Chrome may need to download its
  AI model. This download is performed and managed by Chrome itself (not by the extension), starts
  only when you ask your first question or press **Set up AI & summarize**, and transfers the model
  to your device — not your documents. Chrome's own policies apply to that download.
- **No storage:** document text, questions, answers and summaries are kept in memory only and are
  gone when you close the tool or the tab. They are saved only if you export, download or copy them.
  The recent-task list (if enabled) records file names, such as `report-chat.md`, never the text.
- **Search mode and Quick summary** (when the AI model isn't available) work entirely inside the
  extension without any model.

## Data stored on your device

The extension uses Chrome's local extension storage (`chrome.storage.local`) for:

| Data | Purpose | How to remove |
| --- | --- | --- |
| Settings (theme, default formats, resolution, page size, compression level, save behaviour) | Remember your preferences | Settings → Clear all local data |
| Recent tasks (tool name, input/output **file names and sizes**, time) — only if enabled | Show your recent work | Recent files → Clear history, or turn off "Remember recent tasks" |
| Review prompt: a **count** of finished tasks and your answer ("later", rated, "don't ask again") | Ask for a store rating at most three times, only in copies installed from a store | Settings → Clear all local data |

A light or dark theme choice is also mirrored in the extension's own web storage
(`localStorage`) so the right colours appear before the page has loaded; it is removed when the
theme is set back to the default or local data is cleared.

No document contents, extracted text, summaries, passwords or page images are ever stored.
Uninstalling the extension deletes all of this data.

## Links to other sites

The Donate page, the review prompt, the developer credit and the "report a bug" links open the
Chrome Web Store (or Edge Add-ons), the developer's website (www.shahriarahmed.net) or Telegram in
a new tab, only when you click them. Nothing is sent automatically, and the donation addresses, QR
codes and the developer photo are part of the extension package (no images are fetched).

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

Questions about privacy: Shahriar Ahmed, Unique Labs — [www.shahriarahmed.net](https://www.shahriarahmed.net)
or Telegram [@igfrostt](https://t.me/igfrostt).
