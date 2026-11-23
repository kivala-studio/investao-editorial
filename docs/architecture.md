# Architecture

## Shape

- One route, `/`. `src/app/page.tsx` renders the client component `Portal` (`src/components/portal.tsx`). There are no other pages, API routes, server actions or middleware under `src/app/`.
- All data access happens in the browser through one `@supabase/supabase-js` client created lazily from two public environment variables (`src/lib/supabase.ts`). The client is created with default options.
- Navigation is component state, not URLs. `Portal` holds a `screen` value: `articles`, `edit`, `recaps`, `sources`, `users`, `audit` (`src/components/portal.tsx:34`). Reloading the page returns to `articles`.
- `src/app/layout.tsx` sets `robots: { index: false, follow: false }`. `next.config.ts` sends `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` and `Referrer-Policy: same-origin` on every path.

## Screens

| Screen | Component | Who sees it |
| --- | --- | --- |
| Articles | `portal.tsx` | every member |
| Article editor ("Upload article" / "Review article") | `article-editor.tsx` + `preview.tsx` | every member; editable for `admin` and `editor` |
| Sources | `portal.tsx` | every member; add and rename for `admin` and `editor` |
| Market recaps | `period-recaps.tsx` then `market-recaps.tsx` on one screen | every member; actions for `admin` and `editor` |
| Users & roles | `portal.tsx` | `admin` |
| Audit log | `portal.tsx` | `admin` |

`writable` is `role === "admin" || role === "editor"` (`src/components/portal.tsx:70`). A period recap that is not a draft is always opened read-only (`src/components/portal.tsx:669-672`).

Articles list: 20 rows per page, ordered by `updated_at` descending then `id`, with a title search (`ilike`), a status filter and a category filter (`src/components/portal.tsx:200-223`). The list is not filtered by kind, so period recaps and the articles produced by daily recaps also appear in it.

## Sign-in and access control

All steps are in `refreshIdentity` (`src/components/portal.tsx:72-146`).

1. `auth.getUser()`. No user: the email and password form is shown. Sign-in is `auth.signInWithPassword` (`portal.tsx:255-272`). There is no sign-up, password reset or invitation flow in this repository.
2. The portal reads the caller's row from `editorial_members` (`select role where user_id = <user id>`). No row: it shows "This account has no editorial access…" and signs the session out.
3. `auth.mfa.getAuthenticatorAssuranceLevel()`. If `currentLevel` is not `aal2` the workspace stays closed and one of two gates is shown:
   - Challenge ("Enter code"): used when `auth.mfa.listFactors()` returns an entry in `totp`.
   - Enrolment ("Set up two-step sign-in"): used otherwise. Every factor with status `unverified` is unenrolled first, then a new TOTP factor is enrolled with issuer `invest.ao editorial`. The QR code and the setup key are displayed.
4. The six-digit code is submitted with `auth.mfa.challengeAndVerify` (`portal.tsx:273-291`), then step 1 runs again.
5. With `aal2`, `identity` is set to `{ id, email, role }` and the workspace renders.

A `SIGNED_OUT` auth event (expiry, or sign-out in another tab) closes the workspace (`portal.tsx:151-161`).

What the gate is and is not:

- The second-factor check in this repository is a client-side condition for rendering the workspace. It is not what protects the data.
- The data is protected by row level security and RPC guards in the backend, which all go through `editorial_private.role()`. That function additionally requires an `aal2` session only when the backend flag `editorial_private.control.require_aal2` is true (backend: `supabase/migrations/20261112210000_editorial_second_factor.sql`). See [backend-contract.md](backend-contract.md#divergences-from-the-backend).

Roles are the three values the backend allows in `editorial_members.role`: `admin`, `editor`, `viewer` (`src/lib/types.ts:1`; backend: `supabase/migrations/20260919162150_editorial_news.sql:8`).

### Users & roles

Admins manage membership directly on the `editorial_members` table (`portal.tsx:790-900`):

- Grant: insert `{ user_id, role }`. The user ID must be typed in as a UUID; the portal cannot look accounts up by email.
- Change role: update `role`.
- Revoke: delete the row, after a browser confirmation.

The controls for the admin's own row are disabled.

## Data flow

```
browser (this portal)
  ├─ Supabase Auth      password sign-in, TOTP enrol / challenge / verify
  ├─ PostgREST tables   reads: editorial_members, news_articles (+ relations),
  │                     news_categories, news_sources, securities, market_recaps,
  │                     market_recap_versions, news_audit_log
  │                     writes: news_sources, editorial_members
  ├─ PostgREST RPC      save_news_article, save_period_market_recap,
  │                     review_market_recap_candidate, preview_market_recap,
  │                     publish_market_recap, start_market_recap_correction
  └─ Edge Function      capture-recap-evidence
```

Articles are never written with table inserts or updates from the portal; every article write is one of the RPCs. The exact calls and their locations are in [backend-contract.md](backend-contract.md).

After sign-in the portal loads all categories, all sources and the full `securities` catalogue (paged 500 rows at a time) into memory (`portal.tsx:162-199`).

## Not verified

- Which accounts are members, and how the first admin was created. Nothing in this repository creates a membership without an existing admin.
- Session storage details. The client uses the supabase-js defaults; this repository sets none.
