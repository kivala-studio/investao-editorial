# Testing

None of the suites below was executed while writing this document; the descriptions come from reading the test code.

## Unit tests

```sh
npm test
```

Vitest runs `src/lib/markdown.test.ts` and `src/lib/periods.test.ts`. They cover file import and front matter, rejected uploads, unsafe URLs, the supported Markdown subset, normalisation, publication checks, and the period rules including the Saturday rule for weekly recaps in `Africa/Luanda`. They need no network and no environment variables.

## Static checks

```sh
npm run lint
npm run typecheck
npm run format:check
npm run build
```

## Integration test

```sh
INVESTAO_BACKEND_DIR=/absolute/path/to/investao-functions npm run test:integration
```

`tests/local-api.mjs` is a plain Node script that calls a local Supabase stack over HTTP. It does not use the portal's code.

- It needs the `supabase` CLI and a running local stack in the backend checkout. It reads the local URL and keys from `supabase status -o json` and stops unless the API host is `127.0.0.1`.
- It creates four throwaway accounts (admin, editor, viewer, and one without membership) and deletes them at the end.
- It temporarily switches `editorial_private.control.require_aal2` on with `supabase db query --local` and back off.
- It checks: TOTP enrolment and the second-factor gate, draft visibility per role, the source requirement on publication, stale revision rejection, archiving, period recap drafts and publication rules (using `tests/fixtures/august-2026.md` as a body), role revocation taking effect on an existing token, and the audit log.
- It deletes earlier period fixtures titled "August demonstration draft" and "Synthetic week" from the local database before recreating them.

Never point it at a hosted project.

## UI test

```sh
npx playwright install chromium webkit
npm run test:ui
```

`tests/ui/mobile.spec.ts` starts `next dev` on `127.0.0.1:3100` (`playwright.config.ts`) and mocks every request to the synthetic Supabase URL inside the browser; all other hosts are blocked. It exercises the article list, the editor, the confirmation dialogs, the sources screen and the recaps screen at widths 320, 375, 390, 430, 844 and 1440 in Chromium and WebKit, and asserts that the page never scrolls horizontally.

Known state at this commit:

- The fixture signs in with a synthetic token that has no `aal` claim and mocks no MFA endpoint, while `src/components/portal.tsx` now requires `aal2` before showing the workspace. The fixture's first assertion waits for the Articles heading, so the suite is expected to fail until the fixture is updated. This follows from the code; it was not run.
- WebKit runs write screenshots to `tests/evidence/after` (or `before` with `UI_BASELINE`). That directory is not tracked and not ignored by `.gitignore`.

## CI

`.github/workflows/verify.yml` runs on every push and pull request with Node 22: `npm ci`, then `npm test && npm run lint && npm run typecheck && npm run build`. It does not run the integration or UI tests, or `format:check`.

Not verifiable from the repository: whether GitHub Actions is enabled and running for this repository.
