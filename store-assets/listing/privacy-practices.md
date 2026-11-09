# Privacy practices tab — answers to paste

**Single purpose description**

> Unique PDF lets users view, organise, convert, edit, protect, redact, summarise and ask questions
> about PDF files locally in the browser.

**Permission justification**

| Permission | Justification |
| --- | --- |
| `storage` | Saves the user's preferences (theme, default formats), an optional list of recent file names and sizes, and a count of finished tasks used to decide when to ask for a review — all on the device. |

No host permissions are requested.

**Are you using remote code?**

> No, I am not using remote code.

All JavaScript and WebAssembly ship in the package. (`wasm-unsafe-eval` in the Content Security
Policy is used only to compile the bundled PDF.js image decoders.)

**Data usage**

Select **none** of the data types: the extension does not collect or transmit user data. Unique AI
(chat and summaries) uses Chrome's built-in AI APIs (Prompt API, Summarizer API), which run in the
browser; no document text, question or answer is sent to the developer or any third party.

Tick all three certifications:

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL**

https://pdf.uniquelabs.org/privacy — the website's privacy page, generated from `PRIVACY.md`.
(`privacy-policy.html` in this folder is a standalone copy, if you ever need to host it elsewhere.)
