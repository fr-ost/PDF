# Privacy Policy — Unique PDF

*Effective date: 10 November 2026 · Applies to Unique PDF version 1.3.0 and later*

Unique PDF ("the extension") is a free PDF toolkit for Google Chrome made by Unique Labs and
developed by Shahriar Ahmed. It is designed so that your documents never leave your device.

## Summary

- **Your documents never leave your device.** No file, file name, page, text, image, password, AI
  question or answer is ever sent anywhere.
- All PDF and image processing happens locally in your browser, including Unique AI chat and
  summaries, which run on the AI model built into Chrome.
- **Anonymous usage stats are optional and off by default.** Only if you turn them on does the
  extension send anonymous counts (such as which tools are used) to the developer's own server.
  See [Optional anonymous usage stats](#optional-anonymous-usage-stats).
- There are no accounts, no advertising, no tracking pixels and no third-party analytics services.
  We never sell or share data.

## How your files are handled

1. You choose files with the file picker or drag and drop. The browser gives the extension read
   access to those files only.
2. Files are processed inside the extension's own page and background workers using bundled code
   (PDF.js and pdf-lib). No file, page, text, image or password is sent to any server.
3. Results are kept in memory until you download them. Downloads are saved by Chrome to the
   location you choose. Your original files are only read, never modified.
4. When you close the tab or start over, in-memory data is released.

The extension's Content Security Policy only permits network connections to the extension's own
packaged files and to the usage-stats server
(`connect-src 'self' blob: data: https://unique-pdf.shahriarahmed614.workers.dev`), so the browser
itself blocks any attempt to send data elsewhere. The usage-stats server is contacted only while you
have usage stats turned on, and never receives document data.

## Optional anonymous usage stats

Usage stats help the developer see which tools people use, so the right things get improved. They
are **off until you turn them on**, either in **Settings → Privacy and local data → Share anonymous
usage stats** or with **Share anonymous stats** on the one-time "Help improve Unique PDF?" card that
appears after your first finished task. "No thanks" keeps them off and the card does not return.

**While they are on**, the extension sends small reports to the developer's server
(`unique-pdf.shahriarahmed614.workers.dev`, run on Cloudflare Workers): when you turn them on, once a
day when you use Unique PDF, after an update, and about every 30 minutes while you use it. A report
contains only:

- a random install id that the extension creates when you turn stats on (it is not linked to you,
  your Google account or your device);
- the extension version (and the previous version after an update), your operating system type
  (for example Windows or macOS) and your browser's language (for example "en");
- whether Chrome's built-in AI is available on the device, and how many whole days ago the
  extension was installed;
- counts since the previous report: how many times each tool finished a task (for example
  "Merge: 2"), how many Unique AI questions were asked, and how many minutes the Unique PDF tab was
  open and visible.

If you uninstall the extension while stats are on, Chrome opens a short "Unique PDF was removed"
page on the same server, which records the uninstall for that random id.

**Never sent:** documents or any of their content, file names, file sizes, page counts, passwords,
the text of your AI questions or the answers, summaries, settings, your recent-task list, anything
about the websites you visit, your name, email address or IP address.

**On the server**, the reports are stored with a 2-letter country code that Cloudflare derives from
the connection; the IP address itself is not read or stored. Per-day records are deleted after 400
days. The data is used only to understand how Unique PDF is used and to improve it. It is not sold,
shared or used for advertising, and only the developer can see it, as totals.

**Turning stats off** (Settings, or "Clear all local data") stops all reports immediately and
deletes the random id and any unsent counts from your device. To have the records already sent
under that id deleted from the server, contact the developer (see Contact).

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
| Usage stats: your choice, and — only while stats are on — the random install id, unsent counts and when the last report was sent | Optional anonymous usage stats | Turn off "Share anonymous usage stats", or Settings → Clear all local data |
| Install time | The install age in days, reported only while usage stats are on | Settings → Clear all local data |

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
| `storage` | Save your settings, the optional recent-task list and your usage-stats choice on your device. |

The extension requests **no host permissions**: it cannot read or change the websites you visit,
and it has no access to your browsing history, tabs' contents, cookies or downloads list.

## Children

The extension does not knowingly collect personal data from anyone, including children. The
optional usage stats are anonymous and off unless they are turned on.

## Changes

If this policy changes, the updated version will be published with the extension and in this file,
with a new effective date. Material changes will never introduce data collection without a new
explicit opt-in.

## Contact

Questions about privacy: Shahriar Ahmed, Unique Labs — [www.shahriarahmed.net](https://www.shahriarahmed.net)
or Telegram [@igfrostt](https://t.me/igfrostt).
