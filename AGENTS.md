## Important Rules

1. Cut taglines, helper text and secondary labels. If a screen needs them to make sense, fix the layout.
2. Always make the best decision that elevates user experience (UX), developer experience (DX), and agent experience (AX) together, without breaking anything.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project

Internal editorial portal for invest.ao: a browser-only Next.js client of the invest.ao Supabase project. One route, no server code, no secrets. Start with [README.md](README.md) and [docs/README.md](docs/README.md); do not restate their content here.

| Need | Read |
| --- | --- |
| Screens, sign-in, roles | [docs/architecture.md](docs/architecture.md) |
| Markdown and front matter rules | [docs/authoring.md](docs/authoring.md) |
| Save, publish, audit | [docs/publishing.md](docs/publishing.md) |
| Tables, RPCs, known divergences | [docs/backend-contract.md](docs/backend-contract.md) |
| Environment variables | [docs/configuration.md](docs/configuration.md) |
| Tests and CI | [docs/testing.md](docs/testing.md) |

## Working rules

- This repository is public. Never commit a secret or a real environment value. Only the two `NEXT_PUBLIC_*` names in [docs/configuration.md](docs/configuration.md) belong to the application.
- The backend (`kivala-studio/investao-functions`) and the iOS app are the source of truth. Schema, policies and RPCs are changed there, never worked around here. When this code disagrees with them, record it under "Divergences from the backend" in [docs/backend-contract.md](docs/backend-contract.md).
- Article writes go through the backend RPCs. Do not add direct table writes to `news_articles` or its relation tables.
- Keep `src/lib/markdown.ts` and `src/lib/periods.ts` in step with their tests and with [docs/authoring.md](docs/authoring.md).
- Before handing work over, run what CI runs: `npm test && npm run lint && npm run typecheck && npm run build`.
- Run `npm run test:integration` only against a local Supabase stack.
- Documentation states what the code does at the current commit, with the source path. No history, no plans. Update the "Verified against commit" line in [docs/README.md](docs/README.md) when re-verifying.
