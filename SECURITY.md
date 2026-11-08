# Security

## Reporting a vulnerability

Please report suspected vulnerabilities privately to Unique Labs (use the repository's private
security advisory feature or the support contact on the Chrome Web Store listing). Include steps to
reproduce and, if possible, a synthetic sample file. Do not include real confidential documents.
We aim to acknowledge reports within 5 working days.

## Threat model

| Asset | Threat | Mitigation |
| --- | --- | --- |
| Document contents | Exfiltration to a server | No network code; CSP `connect-src 'self' blob: data:`; build validator rejects CDN/telemetry URLs; E2E tests fail on any external request. |
| Document contents | Malicious PDF exploiting the parser | PDFs are treated as untrusted input; parsing happens in PDF.js's worker and in an isolated processing worker per job; typed error handling; corrupted/truncated/garbage inputs are covered by tests. |
| Browser / extension | Script execution from PDFs | PDF.js scripting is never enabled and its QuickJS engine is not shipped; XFA rendering disabled; document JavaScript is never executed. Redaction's "remove hidden information" also strips document scripts. |
| Extension pages | XSS through file names or metadata | React renders all untrusted strings as text (no `dangerouslySetInnerHTML`); metadata is stripped of control characters and length-limited; tests cover hostile names. |
| Passwords | Leakage | Held in memory only; cleared from forms after use; never stored or logged. |
| Redacted content | Content remains in the file | True removal + reachability pruning + automatic text-extraction verification that blocks export on failure; byte-level unit tests. |
| Deleted pages | Content remains in the file | Pruning removes every object only reachable from removed pages; byte-level unit test. |
| Users | Over-broad permissions | Only `storage`; no host permissions, content scripts, web-accessible resources or external messaging (validated at build time). |
| Document text sent to AI | Leaving the device | Only Chrome's built-in AI APIs (Prompt, Summarizer) are used; no AI service is contacted and the CSP still blocks every network connection. |
| AI output | Injection into the page | Answers and summaries are parsed into a small set of text blocks (headings, lists, bold/italic, page citations) and rendered by React as text; HTML in model output is never interpreted. |
| Prompt injection | A PDF steering the assistant | The model is told that document excerpts are data, never instructions, and to answer only from them; it has no tools or actions (it can only write text), and answers are labelled as AI output to be checked. |
| Hidden data in outputs | Fields, XFA data, structure elements or bookmarks of removed/redacted pages | The pruner severs references to annotations, widgets and structure elements of removed or replaced pages, drops bookmarks that lead only to removed pages and form fields without remaining widgets; Redact removes XFA data; pages copied into new documents are detached from the source form tree. |

## Content Security Policy

```
default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; object-src 'none'; base-uri 'none';
form-action 'none'; frame-ancestors 'none'; frame-src 'none'; worker-src 'self';
connect-src 'self' blob: data:; img-src 'self' blob: data:; font-src 'self' data:;
style-src 'self' 'unsafe-inline'; media-src 'none'
```

- `'wasm-unsafe-eval'` is required so PDF.js can compile its bundled WebAssembly image decoders
  (JPEG 2000, JBIG2) and colour management. It does not allow JavaScript `eval`.
- `style-src 'unsafe-inline'` permits inline style attributes used for layout (e.g. computed
  positions); no inline scripts exist (validated at build time).
- PDF.js 6 contains no `eval`/`new Function` code paths; the validator fails the build if either
  appears in any bundle.

## Encryption details

- **Protect** uses AES-256 (ISO 32000-2, security handler revision 6) implemented in
  `@cantoo/pdf-lib` with Web Crypto randomness. Without a user-supplied permissions password a
  random 48-hex-character owner password is generated so permission restrictions are binding.
  The library's writer encrypts streams but not strings, so before an encrypted save every string
  it would write outside an object stream (catalog, pages, stream dictionaries, objects with a
  non-zero generation number) is encrypted with that object's key (`engines/encryptStrings.ts`);
  a unit test checks that such text is not readable without the password.
- Files with **author restrictions** (owner password only) keep them when edited, and documents
  built from their pages (Extract, Split, Merge, Organize) inherit the strictest combination.
- **Unlock** never guesses or bypasses passwords. For files that open without a password but carry
  author restrictions, the owner password is required to remove them.
- PDF permission flags are advisory by design of the PDF format; the UI says so.

## Input validation

- File types are detected from magic bytes; extensions and MIME types are not trusted.
- Limits: 1 GB per file; images ≤ 20 000 px per side and ≤ 150 MP; canvases clamped to browser
  limits; metadata fields ≤ 2 000 characters; passwords ≤ 127 UTF-8 bytes.
- ZIP entry names are de-duplicated and path separators replaced (no path traversal).
- Output file names are sanitised (control and reserved characters, reserved device names).

## Dependency policy

- Production dependencies are permissively licensed (MIT, Apache-2.0, ISC, OFL) and audited with
  `npm audit` (0 known vulnerabilities at release). Dev-tool advisories are fixed via `overrides`.
- No remote code is loaded at runtime; all assets ship in the package.

## Secure development checklist

Before each release: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` (includes the
manifest/CSP/permission audit), `npm run test:e2e`, `npm audit`.
