# Privacy practices tab — answers to paste

**Single purpose description**

> Unique PDF lets users view, organise, convert, edit, protect, redact, summarise and ask questions
> about PDF files locally in the browser.

**Permission justification**

| Permission | Justification |
| --- | --- |
| `storage` | Saves the user's preferences (theme, default formats), an optional list of recent file names and sizes, a count of finished tasks used to decide when to ask for a review, and the user's choice about optional anonymous usage stats — all on the device. |

No host permissions are requested.

**Are you using remote code?**

> No, I am not using remote code.

All JavaScript and WebAssembly ship in the package. (`wasm-unsafe-eval` in the Content Security
Policy is used only to compile the bundled PDF.js image decoders.)

**Data usage**

Tick **User activity** only. Leave every other data type unticked.

Reason: the optional anonymous usage stats (off by default, opt-in from Settings or a one-time card)
send counts of which tools finished a task, Unique AI questions asked and minutes the app was open,
with the version, OS, browser language, Chrome AI availability, install age and a random install id,
to the developer's own server (https://unique-pdf.shahriarahmed614.workers.dev). The server keeps a
2-letter country code derived by Cloudflare, never the IP address. No personally identifiable
information, website content, web history, location beyond a country, communications,
authentication, health or financial data is collected.

Documents never leave the device. Unique AI (chat and summaries) uses Chrome's built-in AI APIs
(Prompt API, Summarizer API), which run in the browser; no document text, question or answer is
sent to the developer or any third party.

If the dashboard asks for a description of the data use, paste:

> Optional and off by default. If the user turns on "Share anonymous usage stats", the extension
> sends anonymous counts of feature use (tools used, AI questions asked, minutes open), the
> extension version, OS type, browser language and a random install id to the developer's server,
> to understand which features are used. No documents, file names or typed text are ever sent.
> Users can turn it off at any time in Settings.

Tick all three certifications:

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL**

https://pdf.uniquelabs.org/privacy — the website's privacy page, generated from `PRIVACY.md`.
(`privacy-policy.html` in this folder is a standalone copy, if you ever need to host it elsewhere.)
