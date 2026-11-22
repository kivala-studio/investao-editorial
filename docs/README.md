# Documentation

Verified against commit `4a67bb28573f5e1a10ac593b9949cc6b86e53cf2` on 2026-11-22.

Cross-repository facts were checked against the backend `kivala-studio/investao-functions` at `b92cfae`, the iOS app at `cb085c5` and the website at `521af17`. Backend paths are written as `backend: supabase/...`, iOS paths as `ios: Invest.AO/...`, website paths as `web: src/...`. Every other path is relative to this repository.

| Document | Covers |
| --- | --- |
| [architecture.md](architecture.md) | Routes, screens, sign-in, second factor, roles, data flow |
| [authoring.md](authoring.md) | The Markdown file format, front matter, validation, period recap rules |
| [publishing.md](publishing.md) | What a save or publish does, the audit trail, how content reaches the apps |
| [backend-contract.md](backend-contract.md) | Every table, RPC and Edge Function used, and divergences from the backend |
| [configuration.md](configuration.md) | Environment variable names |
| [testing.md](testing.md) | Unit, integration and UI tests, CI |
| [deployment.md](deployment.md) | What the repository proves about deployment |

When this repository and the backend or iOS repository disagree, the backend and iOS are correct. Known disagreements are listed in [backend-contract.md](backend-contract.md#divergences-from-the-backend).
