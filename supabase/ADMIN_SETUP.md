# Admin panel setup

The admin panel is part of the existing app. It is not a public route and is only shown
after `public.is_admin()` confirms that the signed-in Supabase user is allowlisted.
Dashboard-content writes are protected by Postgres RLS. Cross-project question-bank
writes are additionally protected by the trusted Node API described below.

## Current deployment status

- The main admin migration has **already been applied** in the current OINKIE Study
  deployment. Do **not** rerun
  `supabase/migrations/20261022120000_create_admin_dashboard_content.sql` there; it is
  not written as an idempotent migration.
- The Chemistry remote table is still missing. Apply
  `supabase/remote/chemistry_questions.sql` only after reviewing it.
- The four existing remote banks have their table-specific read-only hardening scripts
  pending review and manual application.
- No SQL, remote setting, deployment, or live question write was performed by this code
  change.

For a new deployment, review and apply the main migration once, then enroll the first
admin. Do not apply it a second time.

## 1. Apply the main admin migration (new deployments only)

Review and apply:

`supabase/migrations/20261022120000_create_admin_dashboard_content.sql`

Use the Supabase SQL editor or your normal migration workflow. This creates:

- `public.admin_users` — the UUID allowlist, with no client grants or policies.
- `public.is_admin()` — the server-side allowlist check used by RLS and the Node API.
- `dashboard_quick_actions`, `dashboard_notifications`, `dashboard_quick_links`, and
  `neet_youtube_resources`.
- RLS policies that let authenticated students read active rows and only allowlisted
  admins read all rows, insert, update, or delete.
- Seed rows preserving the current quick-action and quick-link defaults.

The app does not apply migrations automatically.

## 2. Enroll your admin account

In Supabase, open **Authentication → Users** and copy the user's **UID**. This is the
Supabase auth user UUID, not the email address or profile row ID.

Run this once in the Supabase SQL editor:

```sql
insert into public.admin_users (user_id)
values ('<your-supabase-auth-user-uuid>')
on conflict (user_id) do nothing;
```

Refresh the app after enrolling; the admin check runs when the authenticated app loads.
Do not add the UUID to a `VITE_*` variable, source file, or public page. Do not use a
service-role key in the frontend.

To remove admin access later:

```sql
delete from public.admin_users
where user_id = '<your-supabase-auth-user-uuid>';
```

## 3. Configure the trusted admin API

The Question Bank Manager must not write with browser credentials. Copy
`.env.server.example` to `.env.server` and fill:

```text
OINKIE_MAIN_SUPABASE_URL
OINKIE_MAIN_SUPABASE_PUBLISHABLE_KEY
```

Then fill the URL and **server-only service-role key** for each remote bank you intend
to manage:

```text
OINKIE_PHYSICS_SUPABASE_URL / OINKIE_PHYSICS_SUPABASE_SERVICE_ROLE_KEY
OINKIE_BIOLOGY_SUPABASE_URL / OINKIE_BIOLOGY_SUPABASE_SERVICE_ROLE_KEY
OINKIE_CHEMISTRY_SUPABASE_URL / OINKIE_CHEMISTRY_SUPABASE_SERVICE_ROLE_KEY
OINKIE_GENERAL_SUPABASE_URL / OINKIE_GENERAL_SUPABASE_SERVICE_ROLE_KEY
OINKIE_ARCHIVE_SUPABASE_URL / OINKIE_ARCHIVE_SUPABASE_SERVICE_ROLE_KEY
```

`OINKIE_MAIN_SUPABASE_PUBLISHABLE_KEY` is intentionally a publishable key: the API uses
it only with the signed-in user's token to verify the session and call `is_admin()`.
Remote service-role keys must never appear in a `VITE_*` variable, client bundle, public
repository, or log.

Run locally:

```powershell
npm run dev
```

Run the production build:

```powershell
npm run build
npm start
```

The API verifies the main-project session on every request and resolves the remote
project/table only from the centralized registry. A missing configuration is shown as
**server setup needed**; it is never treated as an empty bank.

## 4. Apply remote project SQL

The exact per-project scripts are in `supabase/remote/`:

| Source | Table | Script |
| --- | --- | --- |
| Physics | `physics_questions` | `supabase/remote/physics_questions.sql` |
| Biology | `biology_questions` | `supabase/remote/biology_questions.sql` |
| Chemistry | `chemistry_questions` | `supabase/remote/chemistry_questions.sql` |
| General | `question_bank` | `supabase/remote/general_question_bank.sql` |
| Archive | `question_bank_archive` | `supabase/remote/archive_question_bank.sql` |

Read `supabase/remote/README.md` before applying anything. The Physics script can create or
upgrade its table; the other scripts harden existing tables. All of them add read-only client
policies and indexes, and create no client write policy or write grant. The Node server's
service-role client bypasses RLS only after the main-project admin check.

## 5. Verify before publishing

1. Sign in as the enrolled admin and confirm **Admin Controls** appears in the dashboard
   sidebar. Create, edit, deactivate, reorder, and delete one test row in each dashboard
   content section.
2. Sign in as a normal student and confirm the admin entry is absent. A direct REST
   insert or update against the four dashboard content tables must be rejected.
3. Confirm an anonymous request cannot read the dashboard content tables.
4. Confirm the dashboard displays active content in `sort_order`, and does not display
   inactive rows.
5. Open **Admin Controls → Question Banks** and confirm each configured project shows a
   verified exact count and a separate state. Unconfigured or missing projects must not
   show zero.
6. Confirm a destination-table mismatch is rejected. The API must never fall back to
   another project or table.
7. Create one clearly labelled test question in a configured remote bank, reload it,
   edit it, then delete it. Confirm the status count changes correctly. Do not use live
   student content for this test.
8. Import one small JSON file with one valid and one invalid record. Confirm the preview
   separates them and that no rows are written until the confirmation. Confirm invalid
   records are skipped only after server validation, and that existing rows are not
   overwritten.
9. Sign in as a non-admin and confirm a direct request to
   `/api/admin/question-banks/status` with that user's token is rejected with `403`.
10. Keep publishable keys only in the frontend environment, including the optional
    `VITE_SUPABASE_<SOURCE>_URL` and `VITE_SUPABASE_<SOURCE>_PUBLISHABLE_KEY` values.
    Never use a service-role key or another secret in a `VITE_*` variable.

If the main migration has not been applied in a new deployment, the dashboard falls back
to its built-in quick actions and quick links, and admin access checks fail closed.
