# invest.ao editorial

Internal portal for writing and publishing the news articles and market recaps that the invest.ao iOS app and website read from Supabase. It is a browser-only client of the invest.ao Supabase project: it has no server routes, no database of its own and no privileged credentials (`src/lib/supabase.ts`, `src/app/`).

Documentation index: [docs/README.md](docs/README.md).

## Stack

Versions are pinned exactly in `package.json`.

| Package | Version |
| --- | --- |
| next | 16.3.5 |
| react, react-dom | 19.3.0 |
| @supabase/supabase-js | 2.116.0 |
| react-markdown | 10.1.0 |
| unified / remark-parse / remark-stringify | 11.0.5 / 11.0.0 / 11.0.0 |
| unist-util-visit | 5.1.0 |
| yaml | 2.9.1 |
| lucide-react | 1.47.0 |
| tailwindcss, @tailwindcss/postcss | 4.3.3 |
| typescript | 6.0.3 |
| vitest | 5.0.1 |
| @playwright/test | 1.63.0 |
| eslint, eslint-config-next | 9.39.5, 16.3.5 |
| prettier | 3.9.8 |

Node: the CI workflow uses Node 22 (`.github/workflows/verify.yml`); `next` 16.3.5 requires Node 20.9.0 or newer (`package-lock.json`). `package.json` declares no `engines`.

## Layout

```
src/app/            layout, the single page, global CSS
src/components/     portal.tsx (auth, navigation, lists), article-editor.tsx,
                    period-recaps.tsx, market-recaps.tsx, preview.tsx
src/lib/            markdown.ts (import, validation, normalisation), periods.ts
                    (period rules), supabase.ts (client), types.ts, errors.ts
tests/              local-api.mjs (integration), ui/mobile.spec.ts (Playwright),
                    fixtures/august-2026.md
.github/workflows/  verify.yml
```

## Setup

```sh
npm ci
```

Create `.env.local` (ignored by `.gitignore`) with the two variables in [docs/configuration.md](docs/configuration.md), then:

```sh
npm run dev
```

The portal needs a Supabase project that has the invest.ao backend migrations applied (repository `kivala-studio/investao-functions`). See [docs/backend-contract.md](docs/backend-contract.md).

## Commands

From `package.json`:

| Command | Runs |
| --- | --- |
| `npm run dev` | `next dev` |
| `npm run build` | `next build` |
| `npm start` | `next start` |
| `npm test` | `vitest run` (unit tests in `src/lib`) |
| `npm run lint` | `eslint .` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run format:check` | `prettier --check src tests *.json *.mjs *.ts` |
| `npm run test:integration` | `node tests/local-api.mjs` (needs a local Supabase stack) |
| `npm run test:ui` | `playwright test` |

Details: [docs/testing.md](docs/testing.md).

## Deployment

The repository contains no hosting configuration. What it does prove is in [docs/deployment.md](docs/deployment.md).
