# Deployment

## What the repository proves

- It is a standard Next.js application at the repository root, built with `next build` and served with `next start` (`package.json`).
- It needs no server-side secret. The only runtime configuration is the two public variables in [configuration.md](configuration.md). They are `NEXT_PUBLIC_*` variables referenced in client code (`src/lib/supabase.ts`), so they have to be present when the application is built.
- Every response carries `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` and `Referrer-Policy: same-origin` (`next.config.ts`), and pages ask search engines not to index them (`src/app/layout.tsx`).
- It deploys nothing in the backend. The tables, policies, RPCs and the Edge Function it calls must already exist in the Supabase project; see [backend-contract.md](backend-contract.md).
- `.gitignore` ignores `.vercel/`. There is no `vercel.json`, Dockerfile or other hosting configuration in the repository.
- The only workflow, `.github/workflows/verify.yml`, verifies and builds. It does not deploy.

## Not verifiable from the repository

- Where the portal is hosted and at which URL.
- How a deployment is triggered, and from which branch.
- Which Supabase project the deployed portal points at.
- Access restrictions in front of the portal, if any, other than its own sign-in.
- Supabase Auth settings of the project (whether TOTP enrolment and verification are enabled, password policy, sign-up settings). The portal's second-factor screens depend on TOTP being enabled.
