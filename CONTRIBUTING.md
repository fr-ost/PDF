# Contributing to Unique PDF

Thank you for helping make Unique PDF better. This guide covers setup, conventions and the quality
bar every change must meet.

## Setup

```bash
npm install
```

```bash
npm run dev
```

Node.js 22.13+ is required. See [README.md](README.md) for loading the extension unpacked.

## Before opening a pull request

Run the same checks as a release:

```bash
npm run lint
```

```bash
npm run typecheck
```

```bash
npm test
```

```bash
npm run build
```

```bash
npm run test:e2e
```

All must pass. Never skip, disable or weaken a test to make a change pass — fix the cause.

## Architecture rules

1. **Local only.** No network requests, remote code, analytics or third-party services. The CSP
   and the build validator enforce this; do not loosen them.
2. **pdf-lib stays in the worker.** UI code must not import `src/pdf/engines/*` (except
   `annotations.ts` types and `imageFormats.ts`). Put shared constants and math in pure modules
   under `src/pdf/` (see ARCHITECTURE.md → Bundle boundaries).
3. **Never modify originals.** Tools read `File` objects and always produce new outputs.
4. **Don't hold document bytes in React state.** Keep `File` references; read bytes when a job runs
   (`toSource`) and transfer them to the worker.
5. **Every engine call goes through `loadPdf`/`savePdf`.** Saving prunes unreachable objects —
   this is a privacy guarantee, not an optimisation.
6. **Honest features.** Only add a tool to `src/features/registry.ts` when it works end to end and
   is tested. Document limitations instead of overstating capabilities.
7. **Minimal permissions.** New Chrome permissions require a written justification in the PR and an
   update to PRIVACY.md and `scripts/validate-build.mjs`.

## Code style

- TypeScript strict mode (`noUncheckedIndexedAccess` included); no `any`.
- React function components and hooks; keep components focused and reuse `components/tool/*`.
- Tailwind utility classes with the semantic tokens from `src/styles/index.css`
  (`bg-surface`, `text-fg-muted`, `border-line`, `bg-primary`…) so dark mode works automatically.
- User-facing copy: short, calm, specific about what happened and how to recover.
- Accessibility: every interactive element is reachable by keyboard and has an accessible name;
  use the existing `Dialog`, `Switch`, `Segmented` and `IconButton` primitives.

## Tests

- **Engines:** unit tests in `tests/unit/` using synthetic fixtures (`tests/helpers/fixtures.ts`) and
  independent verification with PDF.js (`tests/helpers/pdfjs.ts`). Never commit private or
  copyrighted documents.
- **UI flows:** Playwright tests in `tests/e2e/` drive the built extension and verify downloaded
  files.
- New tools need at least one unit test for the engine and one E2E test for the workflow.

See [TESTING.md](TESTING.md) for details.

## Commits and releases

- Write descriptive commit messages (what and why).
- Bump `version` in `package.json` for releases (the manifest version is derived from it), add an
  entry to [CHANGELOG.md](CHANGELOG.md), then `npm run package`.

## Licensing

Only add dependencies with permissive licences compatible with distribution in a free extension
(MIT, Apache-2.0, BSD, ISC, OFL for fonts). Avoid AGPL/GPL dependencies. Check bundle size impact
and add notices if the licence requires it (THIRD_PARTY_NOTICES.txt is generated automatically for
production dependencies).
