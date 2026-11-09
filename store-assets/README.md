# Unique PDF — Chrome Web Store kit

Everything needed for the store listing, ready to upload. The graphics and the video are made from
the real extension UI (see [`source/README.md`](source/README.md)); the texts are in `listing/`.
The submission steps and the pre-submission checklist are in [`STORE_LISTING.md`](STORE_LISTING.md).

## Store listing tab

| Dashboard field | File | Spec |
| --- | --- | --- |
| Item name | [`listing/title.txt`](listing/title.txt) (comes from the manifest) | 67 / 75 characters |
| Summary | [`listing/summary.txt`](listing/summary.txt) (comes from the manifest) | 132 / 132 characters |
| Description | [`listing/description.txt`](listing/description.txt) | about 11,800 / 16,000 characters |
| Category, language, URLs, distribution | [`listing/store-settings.md`](listing/store-settings.md) | — |
| Store icon | `store-icon-128.png` | 128×128 PNG (96×96 artwork, transparent padding) |
| Screenshots (up to 5, in this order) | `screenshot-1-chat.png`, `screenshot-2-summary.png`, `screenshot-3-tools.png`, `screenshot-4-edit.png`, `screenshot-5-private.png` | 1280×800, 24-bit PNG, no alpha |
| Small promo tile | `promo-small-440x280.png` | 440×280, 24-bit PNG |
| Marquee promo tile | `promo-marquee-1400x560.png` | 1400×560, 24-bit PNG |
| Global promo video | `unique-pdf-showcase.mp4` — upload to YouTube, paste the URL | 1920×1080, 30 fps, H.264 + AAC, 44.6 s, −14 LUFS |

Plain, undecorated UI screenshots (11, 1280×800) are in `screenshots/` if you prefer them to the
designed ones.

## Privacy practices tab

| Dashboard field | File |
| --- | --- |
| Single purpose, permission justification, remote code, data usage, certifications | [`listing/privacy-practices.md`](listing/privacy-practices.md) |
| Privacy policy URL | host [`listing/privacy-policy.html`](listing/privacy-policy.html) (self-contained page made from `PRIVACY.md`) and paste its URL |

## Marketing extras

| Use | File | Size |
| --- | --- | --- |
| Video thumbnail (YouTube, Full HD) | `social/youtube-thumbnail-1920x1080.png`, `social/youtube-thumbnail-1280x720.png` | 1920×1080, 1280×720 |
| X (Twitter) profile header — words clear of the profile photo and mobile buttons | `social/x-header-1500x500.png` | 1500×500 |
| Link preview (Open Graph) for a website or posts | `social/og-image-1200x630.png` | 1200×630 |
| LinkedIn project media and profile cover | `linkedin/project-banner-1200x627.png`, `linkedin/profile-cover-1584x396.png` | 1200×627, 1584×396 |
| Developer card (website, posts) | `social/developer-card-1200x630.png` | 1200×630 |
| Google Ads, landscape (1.91:1) | `google-ads/ad-landscape-1-chat.png`, `google-ads/ad-landscape-2-tools.png` | 1200×628 |
| Google Ads, square (1:1) | `google-ads/ad-square-1-chat.png`, `google-ads/ad-square-2-private.png` | 1200×1200 |
| Google Ads, portrait (4:5) | `google-ads/ad-portrait-1-popup.png` | 960×1200 |
| Google Ads search keywords (100, in 11 ad groups) and negatives — import with Google Ads Editor | `google-ads/keywords.csv`, `google-ads/negative-keywords.csv` | CSV |
| Google Ads logos | `google-ads/logo-square-1200.png`, `google-ads/logo-landscape-1200x300.png` | 1200×1200, 1200×300 |
| Music of the video (original, synthesized from code) | `unique-pdf-showcase-music.mp3` | 44.6 s, 192 kbps |
| Large app icon | `icon-512.png` | 512×512 |

## Regenerate

```bash
npm run store:kit
```

That builds the extension and runs, in order: `npm run screenshots` (plain UI screenshots),
`npm run store:capture` (2x raw captures), `npm run store:render` (graphics and the privacy page)
and `npm run store:video` (the video and its music). Each step can also be run on its own.

All documents, names and numbers in the images are sample content. The Unique AI answers come from
the same deterministic stand-in for Chrome's AI that the end-to-end tests use (headless Chromium has
no AI model); everything else is the real interface.
