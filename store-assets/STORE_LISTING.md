# Chrome Web Store submission guide

This package has **not** been published. Use this guide for the manual submission.

## 1. Build the package

```bash
npm ci
```

```bash
npm run lint && npm run typecheck && npm test
```

```bash
npm run package
```

Then run the end-to-end suite against the same build:

```bash
npm run test:e2e
```

Upload `release/unique-pdf-<version>.zip` (contents of `dist/`, `manifest.json` at the ZIP root).

## 2. Store listing

Everything for this tab is in the kit — see [`README.md`](README.md) for the full file-by-file
table.

- **Name:** comes from the manifest (`scripts/manifest.ts`); the dashboard shows it as is —
  `listing/title.txt`.
- **Summary:** the manifest description (≤ 132 characters) — `listing/summary.txt`.
- **Description:** paste `listing/description.txt`.
- **Category, language, URLs, distribution:** `listing/store-settings.md`.
- **Store icon:** `store-icon-128.png` (`public/icons/icon-128.png`; large version `icon-512.png`).
  These are neutral product glyphs; replace them with official Unique Labs artwork when available
  (`npm run icons` regenerates the PNGs from `scripts/generate-icons.mjs`).
- **Screenshots (1280×800):** upload `screenshot-1-chat.png` … `screenshot-5-private.png` in
  order. Plain UI screenshots are in `screenshots/` (`npm run screenshots`). The Unique AI shots
  are the real interface driven by the same deterministic stand-ins for Chrome's AI that the E2E
  tests use (headless Chromium has no model); answers and summaries are sample content that
  matches the sample document.
- **Promo tiles:** `promo-small-440x280.png` and `promo-marquee-1400x560.png`.
- **Promo video:** upload `unique-pdf-showcase.mp4` to YouTube (thumbnail
  `social/youtube-thumbnail-1280x720.png`) and paste the URL.

## 3. Privacy practices tab

Paste the answers in `listing/privacy-practices.md` (single purpose, `storage` justification, no
remote code, no data collected, the three certifications). For the **privacy policy URL**, host
`listing/privacy-policy.html` (made from `PRIVACY.md`) at a public address and paste its URL.

## 4. Pre-submission checklist

- [ ] `package.json` version bumped and `CHANGELOG.md` updated
- [ ] `npm run build` validator passes (permissions, CSP, no remote code, no source maps)
- [ ] Unit and E2E suites pass on the packaged build
- [ ] Extension loaded unpacked from `dist/` and smoke-tested manually in current stable Chrome
- [ ] Store kit regenerated for the current UI (`npm run store:kit`)
- [ ] Official Unique Labs icon artwork in place (optional, recommended)
- [ ] `listing/privacy-policy.html` published at a public URL
- [ ] Homepage and support URLs set (see `listing/store-settings.md`)
- [ ] Promo video uploaded to YouTube and linked
