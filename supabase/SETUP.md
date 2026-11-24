# Supabase and Paystack setup

## Local configuration

1. Install the Supabase CLI and Docker Desktop.
2. Copy the root `.env.example` to `.env.local` and fill in the Supabase project URL and publishable key. These are public client values; never put a Supabase secret/service-role key or Paystack secret key in a `VITE_` variable.
3. Copy `supabase/functions/.env.example` to `supabase/functions/.env` and add a Paystack **test** secret key. Keep the function secret file untracked.
4. Run `supabase start`, then `supabase db reset` to apply the SQL migration to the local database.
5. Run the frontend with `npm run dev` and serve functions locally with `supabase functions serve --env-file supabase/functions/.env`.

The Supabase migration creates student profiles by default. An instructor registration creates a pending application; only an authenticated admin can approve it. Create the first admin through the Supabase Dashboard, then grant the `admin` profile role from a trusted operator session. Never expose service-role credentials or add a public admin-registration endpoint.

## Session security

The app signs users out locally after five minutes without activity. Activity is shared between tabs in the same browser so using one app tab keeps the others active. Shared devices should still be signed out manually when unattended; use Supabase admin MFA for administrator accounts.

Administrator routes require a verified TOTP authenticator, and database role checks require a Supabase `aal2` session for admin access. The first admin visit will prompt to enroll an authenticator or verify its current code. Deploy the frontend, enroll and verify the admin authenticator, then apply the `20261105000100_require_admin_mfa.sql` migration. Keep a secure recovery process: if the admin loses their authenticator, a trusted Supabase project owner must restore access using the Supabase dashboard.

## Row-level security checks

All application tables in the core migration have RLS enabled. Table grants are restricted to the columns and operations used by the app; role checks are performed in database policies or security-definer RPCs. Before launch, use separate student, instructor, and admin accounts to verify that students can only read their own enrollments and paid lessons, instructors can only edit their own courses and materials, and admin actions fail without an `aal2` session. Never test with or expose the service-role key in the browser.

## Course media uploads

Course materials accept PDF, MP4, WebM, JPEG, PNG, WebP, GIF, and AVIF files up to 500 MiB per file. Large files use resumable TUS uploads and show upload progress. After applying `20261105000200_expand_course_material_uploads.sql`, set the hosted project's global Storage file-size limit to at least 500 MB in the Supabase Dashboard (Storage settings); the bucket limit cannot exceed the project-wide limit or the plan's supported limit. Supabase Free projects are limited to 50 MB per file, so accepting 500 MB uploads requires Pro or higher and a global limit adjustment. Keep an eye on Storage usage and bandwidth, especially for video lessons.

## Paystack test setup

Set these as Supabase Edge Function secrets in the hosted project, or in the ignored local function env file:

- `PAYSTACK_SECRET_KEY`
- `ACADEMY_APP_ORIGIN`

The instructor payout form loads available banks through the authenticated `list-banks` Edge Function, so instructors select a bank by name rather than looking up its Paystack code. Deploy all Edge Functions after changing this flow.

Configure the Paystack webhook URL as `https://<project-ref>.supabase.co/functions/v1/paystack-webhook`. The webhook verifies Paystack's HMAC signature, re-verifies the transaction, matches the order amount/currency, and only then records enrollment and the gross 80/20 ledger allocation.

The instructor share is 80% of gross listed price in kobo. Provider fees are paid from the academy's 20% share. Instructor payouts are later transfers from the server-reserved available balance, not client-calculated values.

## Deploy Edge Functions

Deploy from the repository root and pass the functions import map so the Supabase CLI can resolve `@supabase/supabase-js` while bundling:

```powershell
npx supabase functions deploy --import-map supabase/functions/import_map.json
```

This deploys all functions in `supabase/functions`. A Docker warning is not itself a deployment failure; if local bundling requires Docker, add `--use-api` to have Supabase bundle the functions remotely.

## Before live mode

- Apply and test the migration against a real local Supabase Postgres instance; this workspace does not contain Supabase project credentials.
- Configure email verification, password reset, production site/redirect URLs, and admin MFA.
- Use Paystack test keys and test bank accounts first; verify successful, failed, duplicate, delayed, refunded, reversed, and replayed webhook cases.
- Confirm Paystack approves the marketplace/aggregator model and delayed instructor payouts for the academy's business account before accepting real money.
- Decide the subscription product and billing cadence before enabling recurring billing. Subscription plans and recurring-charge handling are not implemented in this migration.
- Add monitoring, reconciliation, retention/privacy policies, backup procedures, and an operational process for disputes, refunds, account deletion requests, and payout failures.

No real payment or Supabase credentials are included in this repository.
