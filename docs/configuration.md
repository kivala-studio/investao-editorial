# Configuration

This repository is public. Never commit a value for any variable below. `.gitignore` ignores every `.env*` file.

## Application

Read in `src/lib/supabase.ts`. Both are required; if either is missing the portal shows "Configure the Supabase URL and publishable key before signing in." when it first needs the client.

| Name | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL of the Supabase project |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The project's publishable (client) key |

Both are public client settings and end up in the browser bundle. The application reads no other environment variable and must not be given a service-role key, database password or any other secret: there is no server-side code that could keep one private.

## Tests only

| Name | Read in | Purpose |
| --- | --- | --- |
| `INVESTAO_BACKEND_DIR` | `tests/local-api.mjs` | Path to a checkout of the backend repository. Defaults to a sibling directory named `investao-functions`. |
| `UI_BASELINE` | `tests/ui/mobile.spec.ts` | When set, the UI test only captures screenshots into `tests/evidence/before` and skips assertions after the editor opens. |

`playwright.config.ts` starts its own dev server with synthetic values for the two application variables; they point at `127.0.0.1` and are not real credentials.

## Other configuration files

| File | Content |
| --- | --- |
| `next.config.ts` | Turbopack root; three security response headers for every path |
| `tsconfig.json` | Strict TypeScript, path alias `@/*` to `src/*` |
| `eslint.config.mjs` | `eslint-config-next` core-web-vitals and TypeScript presets |
| `postcss.config.mjs` | Tailwind CSS PostCSS plugin |
| `vitest.config.ts` | Excludes `tests/ui/**` from unit test runs |
| `playwright.config.ts` | Chromium and WebKit projects, one worker, dev server on `127.0.0.1:3100` |
