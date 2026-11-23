# Backend contract

The portal talks to one Supabase project. Its schema, policies, RPCs and Edge Functions are defined in `kivala-studio/investao-functions`; this repository contains none of them. Backend paths below are relative to that repository and were read at `b92cfae`.

The backend is the source of truth. Where this portal disagrees with it, the backend is right; see [Divergences](#divergences-from-the-backend).

## Auth

| Call | Where |
| --- | --- |
| `auth.getUser` | `src/components/portal.tsx:78` |
| `auth.signInWithPassword` | `portal.tsx:261` |
| `auth.signOut` | `portal.tsx:96`, `portal.tsx:295` |
| `auth.onAuthStateChange` | `portal.tsx:155` |
| `auth.mfa.getAuthenticatorAssuranceLevel` | `portal.tsx:101` |
| `auth.mfa.listFactors` | `portal.tsx:106` |
| `auth.mfa.unenroll` | `portal.tsx:117` |
| `auth.mfa.enroll` (TOTP, issuer `invest.ao editorial`) | `portal.tsx:122` |
| `auth.mfa.challengeAndVerify` | `portal.tsx:280` |

## Tables

| Table | Operation | Where | Backend rule |
| --- | --- | --- | --- |
| `editorial_members` | select own `role` | `portal.tsx:85-89` | own row, or any row for an admin (`members_read`) |
| `editorial_members` | select `user_id, role`; insert; update `role`; delete | `portal.tsx:235-240`, `806-811`, `860-863`, `883-886` | admin only (`members_manage`) |
| `news_articles` with `news_article_sources`, `news_article_categories`, `news_article_securities` | select (`articleSelect` in `src/lib/types.ts:46`) | `portal.tsx:200-223`, `src/components/period-recaps.tsx:23-35` | any member reads all statuses (`articles_editorial_read`) |
| `news_articles` | select `revision` by id | `src/components/market-recaps.tsx:266-270` | same |
| `news_categories` | select `id, name` | `portal.tsx:169` | public read |
| `news_sources` | select `id, name` | `portal.tsx:170` | public read |
| `news_sources` | insert `name`; update `name` | `portal.tsx:310-321`, `764-767` | admin or editor (`reference_write`) |
| `securities` with `issuers(name)` | select `id, symbol, name` | `portal.tsx:176-185` | public read grant |
| `market_recaps` | select | `market-recaps.tsx:111-117` | any member (`recap_editor_read`) |
| `market_recap_versions` | select | `market-recaps.tsx:121-130` | any member (`recap_version_editor_read`) |
| `news_audit_log` | select `*`, newest 100 | `portal.tsx:243-247` | admin only (`audit_read`) |

Policies for the news tables and `editorial_members`: `supabase/migrations/20260919162150_editorial_news.sql`. Recap tables: `supabase/migrations/20260925195332_market_recap_schema.sql`.

The portal never inserts, updates or deletes `news_articles` or its relation tables directly.

## RPCs

| RPC | Arguments sent | Where | Backend definition |
| --- | --- | --- | --- |
| `save_news_article` | `document`, `expected_revision` | `src/components/article-editor.tsx:158-168` | `20260919162150_editorial_news.sql:194` |
| `save_period_market_recap` | `document`, `expected_revision` | same call | `20261002123516_optional_period_reference_session.sql:25` |
| `review_market_recap_candidate` | `requested_recap_id`, `expected_version`, `expected_hash`, `expected_revision`, `review` | `market-recaps.tsx:216-235` | `20260925195333_market_recap_generation.sql:180` |
| `preview_market_recap` | `requested_recap_id`, `requested_version` | `market-recaps.tsx:246-249` | `20260925195334_market_recap_publication.sql:51` |
| `publish_market_recap` | `requested_recap_id`, `expected_version`, `expected_hash`, `expected_revision`, `expected_article_revision` | `market-recaps.tsx:274-280` | `20260925195334_market_recap_publication.sql:97` |
| `start_market_recap_correction` | `requested_recap_id`, `expected_version` | `market-recaps.tsx:293-296` | `20260925195336_market_recap_corrections.sql:1` |

`review` contains `evidence_id`, `expected_symbols`, `turnover`, `share_count`, `trade_count`, `coverage_confirmed`, `headline`, `commentary`, `correction_note`.

The write RPCs require role `admin` or `editor`; `preview_market_recap` requires any editorial role. Authorisation guards were tightened to treat a missing role as a refusal in `20261008212740_reject_missing_recap_editorial_roles.sql`.

Error codes the portal can receive and shows as the backend's message text: `42501` (no write access, or "Use the recap publication workflow"), `PT409` (stale revision or version; PostgREST returns HTTP 409), `23514` (a rule failed, for example no source, incomplete period, totals do not reconcile), `22023` (invalid input).

## Edge Function

`capture-recap-evidence` (`supabase/functions/capture-recap-evidence/index.ts`), invoked from `market-recaps.tsx:183-211`:

| Body | Returns |
| --- | --- |
| `{ tradingDate, sourceUrl }` | `{ id, tradingDate, sourceUrl, sha256, rawObjectPath }` |
| `{ action: "signedUrl", rawObjectPath }` | `{ signedUrl }`, valid for 60 seconds; the portal navigates the browser to it |

The function requires a signed-in caller whose `current_editorial_role()` is `admin` or `editor`. It accepts only HTTPS URLs on `bodiva.ao` or a subdomain, and only PDF content up to 12 MB.

## Backend objects the portal relies on indirectly

- `editorial_private.role()`: used by every policy and RPC above; applies the optional second-factor requirement (`20261112210000_editorial_second_factor.sql`).
- Triggers on `news_articles` and its relation tables: revision, audit log, source requirement, period notice, daily-recap article guard, publication record for notifications.

## Backend objects the portal does not use

- `public.current_editorial_role()` (`20261112210000_editorial_second_factor.sql:25`). The portal reads `editorial_members` instead.
- `public.approve_assistant_prepared_article(uuid, integer)` (`20261014220539_assistant_publication_bridge.sql:41`). No screen calls it.

## Divergences from the backend

The backend wins in each case. None of these is fixed here.

1. **Second factor.** The portal always requires an `aal2` session before it renders the workspace (`portal.tsx:99-134`). The backend requires `aal2` only when `editorial_private.control.require_aal2` is true; the migration creates that flag as `false` (`20261112210000_editorial_second_factor.sql:3-7`). The portal decides the role by reading `editorial_members`, which returns the caller's own row at any assurance level, rather than calling `current_editorial_role()`. While the backend flag is off, a member's `aal1` session is accepted by the API even though the portal's screens stay closed. The current value of the flag in production is not verifiable from either repository.

2. **Articles generated by daily recaps look editable.** The Articles list includes the articles created by `publish_market_recap`, and the editor offers Archive, Unpublish and Publish changes on them. The backend rejects any update of an article linked from `market_recaps` outside `publish_market_recap` with `42501` "Use the recap publication workflow" (`20260925195334_market_recap_publication.sql:69-81`, `20261015220236_allow_recap_editor_account_deletion.sql:34-55`). Corrections must go through "Preparar correcção".

3. **Archived bulletin button for viewers.** "Abrir cópia arquivada do boletim" is shown to every role (`market-recaps.tsx:492-502`). The Edge Function refuses callers who are not `admin` or `editor` with HTTP 403.

4. **Markdown subset.** The backend stores any text up to 262 144 bytes; the allowed subset is enforced only by `src/lib/markdown.ts`. The iOS reader renders pipe tables (ios: `Invest.AO/Features/News/Data/NewsMarkdown.swift:87-103`), but the portal cannot produce them: its parser has no table extension and its normaliser joins the lines of what it sees as a paragraph (`src/lib/markdown.ts:190-193`). This was established by reading the code, not by running it.

5. **Period notice shown twice in preview.** The backend stores the period notice as the first line of `body_markdown`. The portal's preview adds its own notice above the title for period recaps (`src/components/preview.tsx:24-30`) and then renders the body, so a saved period recap shows both.

6. **Publish confirmation wording for daily recaps.** The dialog says the publication sends the notification to subscribers (`market-recaps.tsx:257-261`). In the backend, whether and how a push is sent is decided by the notification pipeline and its control rows, not by `publish_market_recap` alone (`20261002153016_news_publication_delivery.sql`).

7. **Source uniqueness.** The backend's primary key on `news_article_sources` is `(article_id, source_id, source_url)` and `source_url` is limited to 2048 characters (`20260919162150_editorial_news.sql:56-64`). The portal checks neither; a duplicate or over-long entry fails at save with the database's message.

## Not verified

- The deployed state of the backend: which migrations are applied, and the values of control rows (`editorial_private.control`, recap generation and sending, notification mode).
- Row level security on `securities` and `issuers` beyond the read grant.
