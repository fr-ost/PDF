# Store kit: how it is made

The designed screenshots, promo tiles, social and ad images and the showcase video in
`store-assets/` are built from the real extension UI, not mock-ups.

1. **Captures** — `tests/store/raw.spec.ts` (`npm run store:capture`) loads the built extension
   (`dist/`) in Chromium at 2x pixel density, opens sample documents in the real tools (Chat with
   PDF, AI Summary, the editor, Redact, Organize, Compress, the tool grid and the popup, in light
   and dark themes) and saves 2880×1800 captures to `raw/` (not committed). Unique AI answers come
   from the deterministic stand-in for Chrome's AI used by the E2E tests (`tests/e2e/fakeAi.ts`).
2. **Graphics** — `render.mjs` (`npm run store:render`) lays the captures out with headlines,
   chips and callouts in HTML (Geist, the app's typeface, and the brand gradient; icons are the
   app's Lucide icons) and renders every asset at its exact size, then converts them to 24-bit PNG
   without alpha, as the store requires. `node render.mjs <name>` renders matching assets only.
   It also runs `privacy-page.mjs`, which turns `PRIVACY.md` into `listing/privacy-policy.html`.
3. **Video** — `video.mjs` (`npm run store:video`) renders nine scenes (intro, chat, summary,
   tools, edit and sign, redact, compress, privacy, outro) frame by frame in Chromium — text slides
   in, slow camera moves over the captures — pipes the frames to ffmpeg, joins the scenes with
   0.6 s crossfades, and lays the music over it, loudness-normalised to −14 LUFS.
   `STILLS=1 node video.mjs` saves one still per scene instead, for a quick layout check.
4. **Music** — `music.py` writes an original music bed synthesized from code (nothing sampled or
   downloaded): warm pads, a plucked arpeggio, bass and soft drums in D major at 104 BPM, timed to
   the cut, with an intro and an outro. Needs Python 3 with numpy.

Shared building blocks (paths, fonts, icons, framed crops, the brand row, chips and the chat
callout) are in `templates.mjs`.

Requirements: the project's dev dependencies (`npm ci`), a build (`npm run build`), ffmpeg with
libx264 and AAC, and Python 3 with numpy. There is no voice-over; to add one, record or generate
narration and mix it in with ffmpeg (the scene timings are in `video.mjs`).
