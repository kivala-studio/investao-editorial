# Invest.ao Editorial

The standalone Next.js editorial application for Invest.ao. Editors write in Notion
(or another Markdown editor), export `.md`, review the import, and publish to the
existing Supabase project. The database stores canonical Markdown; the iOS reader
never downloads a Storage object.

## Run

Use Node 22 or newer. From the repository root:

```sh
npm ci
```

Create an ignored `.env.local` before starting the app and set
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the
Supabase project dashboard. These are public client settings. Do not add a
service-role key or database password. Then run `npm run dev`. Run the
backend migrations before using the portal. Hosting should use the repository root (`.`) as its
root directory, `npm run build` as its build, and `npm start` for a Node deployment.
The application has no public signup or privileged server endpoints.

## Deploy manually

Deploy this repository independently of the backend. On Vercel, import the GitHub
repository as a Next.js project with its root directory set to `.`. Set
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in the
Vercel project's Production environment before deploying. Next.js embeds these
public values in the browser bundle during the build. No administrative
credentials are required by the host.

Database migrations and RLS tests remain in
[kivala-studio/investao-functions](https://github.com/kivala-studio/investao-functions).
The editorial migration is `20260919162150_editorial_news.sql` and is already applied
to production. This repository does not deploy the backend or the iOS app.

## Access and initial administrator

The designated initial administrator is `main@invest.ao`. Roles are database-managed;
the email address is not a client-side authorization bypass.

Use existing Supabase Auth accounts. A backend operator bootstraps the first admin
once, replacing the placeholder UUID with a verified existing account ID:

```sql
insert into public.editorial_members(user_id, role)
values ('EXISTING-USER-UUID', 'admin');
```

Admins can then grant, change, or revoke editorial membership by existing user ID
in **Users & roles**. Editors never need dashboard access. Mobile account signup
remains unchanged; creating an ordinary mobile account does not grant editorial
access. Editorial membership is read from the database on every request so role
revocation takes effect without waiting for an access token refresh. `viewer` can
read drafts, `editor` can publish, and `admin` can also manage access and read audits.
New Auth accounts are provisioned through the existing account flow; this portal
does not offer invitations or create separate user records.

## Workflow

1. Upload a UTF-8 `.md` file (maximum 256 KB).
2. Optional YAML fields: `title`, `summary`, `category`, `securities` (symbols),
   `sources` (objects with `name`, `url`, and boolean `primary`).
3. Review metadata, resolve unknown category/security/source names, and check the
   reader preview. Source URLs must use HTTP or HTTPS. Prefer primary sources.
4. Save draft or publish. Publication requires title, summary, body, and a source.
5. Open an article to replace Markdown. Replacement stays local until saved;
   live changes, unpublication, and archiving require confirmation.

Supported Markdown: headings, paragraphs, bold, italic, HTTP(S) links, single-level
ordered and unordered lists, blockquotes, and horizontal rules. HTML, images, code,
reference links, and nested lists are flagged and must be removed before publishing.
The preview does not execute HTML. The native reader removes unsafe link schemes.
Original upload files are not retained; optional Storage retention is deferred.

Saves use a single RLS-protected transaction and a revision precondition. A stale
editor must reload instead of overwriting a newer save. Deferred database constraints
also prevent direct API writes from publishing without a source or deleting the last
source of a live article. Relationship changes update revision and audit history.

## Verify

```sh
npm test
npm run lint
npm run typecheck
npm run build
```

From the backend root, `supabase db reset --local` replays migrations and
`deno task test:db` runs pgTAP tests. Never point tests at production. The migration
is additive and requires no market-data backfill. Deploy it before the portal and
iOS reader; until then the mobile news section displays a retry state.

For local REST integration tests, start the backend's local Supabase stack and run:

```sh
INVESTAO_BACKEND_DIR=/absolute/path/to/investao-functions npm run test:integration
```

If the variable is omitted, tests look for a sibling `investao-functions` checkout.
They obtain credentials from its local CLI status and reject non-loopback endpoints.
They create and remove local test accounts and never use production credentials.
