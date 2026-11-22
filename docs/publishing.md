# Publishing

There are three kinds of content. All of them end up as rows in `news_articles`.

| Kind | Authored in | Saved with |
| --- | --- | --- |
| Article | `src/components/article-editor.tsx` | RPC `save_news_article` |
| Period recap (weekly, monthly, annual) | the same editor, opened from `src/components/period-recaps.tsx` | RPC `save_period_market_recap` |
| Daily recap ("Fechos das acções") | `src/components/market-recaps.tsx` | RPC `publish_market_recap` |

## Articles

### Buttons and statuses

The editor's action bar has three buttons (`article-editor.tsx:585-612`). Each one saves the whole article with a target status:

| Button | Target status |
| --- | --- |
| Archive | `archived` |
| Save draft (shown as "Unpublish" when the opened article is published) | `draft` |
| Publish (shown as "Publish changes" when the opened article is published) | `published` |

Before the request (`requestSave`, `article-editor.tsx:124-150`):

1. The slug format is checked.
2. For a period recap, the period rules are checked.
3. For target `published`, the publication checks are run. See [authoring.md](authoring.md#publication-checks).
4. A confirmation dialog is shown when the target is `published` or `archived`, or when the opened article is currently published (so any save of a live article is confirmed). Otherwise the save runs immediately.

Nothing is saved automatically.

### The request

One RPC call (`article-editor.tsx:151-177`):

```
rpc(recap_period ? "save_period_market_recap" : "save_news_article", {
  document: { ...article, body_markdown: normalizeMarkdown(body), status },
  expected_revision: article.revision ?? null,
})
```

`document` carries `id` (absent for a new article), `slug`, `title`, `summary`, `body_markdown`, `status`, `sources` (`source_id`, `source_url`, `source_title`, `is_primary`), `category_ids`, `security_ids`, and for period recaps the four period fields. On success the portal returns to the list. On failure the backend's error message is shown in the editor and the editor stays open.

### What the backend does

`public.save_news_article` (backend: `supabase/migrations/20260919162150_editorial_news.sql:194-225`), in one transaction:

1. Rejects callers whose editorial role is not `admin` or `editor`.
2. Locks the article row and compares `expected_revision` with the stored `revision`. A mismatch, or a revision supplied for an article that no longer exists, fails with code `PT409`. This is how a stale editor is stopped from overwriting a newer save.
3. Inserts or updates `news_articles`. `published_at` is set to the current time on the first publication and kept on later saves.
4. Replaces the article's rows in `news_article_sources`, `news_article_categories` and `news_article_securities` with the ones in the document.

Triggers on `news_articles` (same migration, and `20261015220236_allow_recap_editor_account_deletion.sql`) then:

- Set `revision`, `updated_at`, `updated_by` and `archived_at`. Every change to a relation row also touches the article, so one save raises `revision` by more than one.
- Refuse, at commit, a published article with no source.

Database constraints repeat the portal's checks: slug format, title at most 300 characters, summary at most 2000, body at most 262 144 bytes, and a published article needs a non-blank title, summary and body. The backend does not check which Markdown constructs the body uses; that check exists only in this portal.

### Audit trail

The backend writes `news_audit_log` rows from a trigger on `news_articles`; the portal never writes to it (backend: `20260919162150_editorial_news.sql:136-152`).

| Action | Written when |
| --- | --- |
| `article_created` | the article row is inserted |
| `article_updated` | the article row is updated, including the updates caused by relation changes |
| `markdown_uploaded` | on insert, and whenever `body_markdown` changes |
| `article_published`, `article_unpublished`, `article_archived` | the status changes (or a new article is inserted with a status other than `draft`) |

Each row records the article, the acting user and the time. Admins see the latest 100 rows on the Audit log screen (`src/components/portal.tsx:242-250`, `901-937`). Other roles cannot read the table.

## Period recaps

`public.save_period_market_recap` (backend: `supabase/migrations/20261002123516_optional_period_reference_session.sql:25-56`) wraps `save_news_article`: it saves the document as a draft first, then sets the period fields and the requested status in the same transaction. It refuses to touch an existing article that is not a period recap in `draft` status.

Consequences in the portal:

- A published or archived period recap opens read-only (`src/components/portal.tsx:669-672`). The portal offers no way to unpublish, archive or correct it.
- A trigger prepends one blockquote line to the stored body, for example `> Relatório histórico · monthly · 2026-08-01 a 2026-08-31 · Base agregada mensal; sem sessão específica. Dados do período; não são cotações actuais.` (backend: same migration, `period_notice` and `period_article`). The line is part of `body_markdown`, so the apps show it without knowing about period recaps, and the editor shows it when a saved draft is reopened.
- The backend enforces the same period rules as `src/lib/periods.ts`, including publication from Saturday for weekly recaps (backend: `supabase/migrations/20261017080746_weekly_editorial_saturday.sql`), and allows one recap per period type and start date.

## Daily recaps

The backend generates one candidate per trading date in `market_recaps` / `market_recap_versions`. The portal lists the 30 most recent dates and walks the current version through four steps (`src/components/market-recaps.tsx`):

1. **Archive the bulletin.** The editor pastes the URL of the official BODIVA PDF. The portal invokes the Edge Function `capture-recap-evidence` with `{ tradingDate, sourceUrl }`. The function downloads the PDF, stores it and returns an evidence `id`, `sha256` and `rawObjectPath` (backend: `supabase/functions/capture-recap-evidence/index.ts`).
2. **Reconcile.** The editor enters the bulletin's symbols and totals (turnover, shares, trades), a headline, optional commentary, a correction note when the date was already published, and ticks the coverage confirmation. The portal calls `review_market_recap_candidate`. The backend accepts only when the symbols and totals equal the candidate's figures, the headline and commentary contain no digits, and the evidence belongs to that trading date (backend: `supabase/migrations/20260925195333_market_recap_generation.sql:180-271`). The version becomes `ready`.
3. **Preview.** `preview_market_recap` returns the generated title, summary, Markdown body and push text. Nothing in that text is editable in the portal.
4. **Publish.** After a browser confirmation the portal reads the linked article's `revision` (if the date already has an article) and calls `publish_market_recap`. The backend renders the article, saves it through `save_news_article` as `published` with slug `fecho-accoes-<date>`, source `BODIVA`, categories `Mercados` and `Acções` and up to three securities, and marks the version `approved` (backend: `supabase/migrations/20260925195334_market_recap_publication.sql:97-176`).

"Preparar correcção" on a published date calls `start_market_recap_correction`, which creates the next version in `blocked` state; the four steps are then repeated and a correction note is required.

All four calls pass the version, facts hash and content revision the portal last loaded. The backend rejects the call with `PT409` if any of them changed.

## How published content reaches the apps

The portal's part ends when the row is in `news_articles` with `status = 'published'`. From there:

- **Visibility.** Row level security lets anonymous and signed-in users read an article only when `status = 'published' and published_at <= now()`; relation rows are readable when their article is (backend: `20260919162150_editorial_news.sql:90-112`). Unpublishing or archiving therefore removes an article from the apps immediately.
- **iOS** reads `news_articles` directly, filtered to published rows, with categories, sources, securities and the linked daily recap date, and fetches `body_markdown` only for the detail view (ios: `Invest.AO/Features/News/Data/NewsRepository.swift`). It renders the body with its own block parser (ios: `Invest.AO/Features/News/Data/NewsMarkdown.swift`).
- **Website** reads the same table with the same filters and opens articles by slug (web: `src/data/market/public.ts`).
- **Notifications.** A backend trigger records each publication, and the backend's notification pipeline turns it into a `news_publication` notification titled "Novo artigo publicado" or "Novo recap publicado" (backend: `supabase/migrations/20261002153016_news_publication_delivery.sql`). The portal has no control over this beyond publishing.

## Not verified

- Whether notifications are currently being sent. That depends on backend control rows that are data, not code.
- Whether daily recap candidates are currently being generated. The portal only reads what exists.
