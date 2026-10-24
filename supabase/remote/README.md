# Remote question-bank projects

This directory contains reviewed-by-code, project-specific SQL for the five OINKIE Study
question banks. Nothing in this directory was executed by the code change that added it.

## Live status observed by the workspace

| Source | Registered table | Live read probe before activation | Admin status now |
| --- | --- | --- | --- |
| Physics | `public.physics_questions` | HTTP 200, zero readable rows | Count can be verified only when server env is configured |
| Biology | `public.biology_questions` | HTTP 200, zero readable rows | Same |
| Chemistry | `public.chemistry_questions` | HTTP 404 / `PGRST205`, table missing | **Missing table** until SQL is applied |
| General | `public.question_bank` | HTTP 200, zero readable rows | Count can be verified only when server env is configured |
| Archive | `public.question_bank_archive` | HTTP 200, zero readable rows | Same |

A zero-row read probe does not prove the full remote column schema. A read-only audit of the
four reachable tables additionally confirmed these reader columns:
`id`, `question_code`, `chapter`, `topic`, `section`, `exercise`, `question_en`,
`question_hi`, `options`, `answer_key`, `answer_key_source`, `explanation_en`,
`explanation_hi`, `difficulty`, `source_pdf`, `source_page`, `tags`, and `created_at`.
Physics has no subject column; Biology has `subject_area`; General and Archive have
`subject`. The pre-migration audit did not find `updated_at`, image columns, `images`,
`question_number`, `review_required`, or `formulas`, so the admin form does not offer
those fields. The Physics and Chemistry SQL add `updated_at`, but the UI and importer
do not require it.

The admin UI follows the existing public reader contract and reports backend/schema errors
rather than inventing columns or weakening validation. Review each table's actual schema
before the first live write.

## Fixed mappings

These mappings are defined once in `src/questionBanks/sourceRegistry.ts` and must not be
changed per feature:

| Source | Project env prefix | Table | Subject contract |
| --- | --- | --- | --- |
| Physics | `OINKIE_PHYSICS` | `physics_questions` | No subject write column; reader forces Physics |
| Biology | `OINKIE_BIOLOGY` | `biology_questions` | `subject_area` = Botany or Zoology |
| Chemistry | `OINKIE_CHEMISTRY` | `chemistry_questions` | `subject` = Chemistry; UUID IDs |
| General | `OINKIE_GENERAL` | `question_bank` | `subject` = Physics, Chemistry, Botany, or Zoology |
| Archive | `OINKIE_ARCHIVE` | `question_bank_archive` | `subject` = Physics, Chemistry, Botany, or Zoology |

The frontend reader still uses the matching
`VITE_SUPABASE_<SOURCE>_URL` / `VITE_SUPABASE_<SOURCE>_PUBLISHABLE_KEY` publishable-key
variables. Those are read-only credentials. Admin mutations use the server-only
`OINKIE_<SOURCE>_SUPABASE_SERVICE_ROLE_KEY` after main-project authorization.

## Five primary admin sections

The admin **Question Banks** tab exposes exactly five primary sections:

| Primary section | Source | Table | Server lock |
| --- | --- | --- | --- |
| Physics | Physics | `physics_questions` | source/table only; no subject column |
| Chemistry | Chemistry | `chemistry_questions` | `subject = Chemistry`; UUID IDs |
| Botany | Biology | `biology_questions` | `subject_area = Botany` |
| Zoology | Biology | `biology_questions` | `subject_area = Zoology` |
| PYQs | — | none | **Setup required**; no fallback source |

General and Archive stay available under the secondary **Other registered banks** area. They are
not primary sections and are not used as a fallback for PYQs or any subject section.

The browser sends `adminSection` for list, create, update, delete, and import requests. The
existing `section` request field remains the question's own section filter. The server resolves
`adminSection` through `src/questionBanks/sourceRegistry.ts`, rejects source/table/section
mismatches, applies the subject lock, and scopes update/delete by `subject_area` or `subject`.
The shared Biology table refuses create, update, delete, and import without a Botany or Zoology
section, so a caller cannot bypass the two-subject split by omitting `adminSection`.

## JSON templates and imports

Each configured section has **Import JSON** and **Download JSON Template** side by side. Templates
use the versioned `oinkie-question-bank-template` envelope with `schema_version: "1.0"`, root
destination metadata (`source`, `table`, `subject_field`, `subject`, `id_kind`), field documentation,
and one bilingual sample question with four options, answer key, answer-source text, explanations,
difficulty, source PDF/page, and tags. The downloaded file passes the production importer and
normalizer for its own section.

Imports are previewed before any write and are cancelled without changing data. The browser enforces
1,000 records and 20 MiB; the server validates every record again, inserts accepted rows in batches of
25, does not overwrite existing rows, and reports partial batch failures. A downloaded template whose
section/source/table does not match the selected view is rejected before preview.

Image fields are not offered. The audited live tables have no image columns and this project has no
verified remote image-storage/renderer contract, so silently dropping an image reference would be
misleading. Local question-bank image support is separate from remote admin storage.

## PYQs are not configured

The existing NEET PYQ Tests page reads root-level `pyqPaper` metadata from locally saved question
banks. That local paper catalog is not a remote admin source and has no verified exam/year/paper/
question-number schema. The PYQs primary section therefore displays a setup-required view with no add,
edit, delete, import, template-download, or status action. It must not route to General, Archive,
Chemistry, Biology, or another table. Activating it requires an approved source-specific table or
migration, identifier model, public reader and renderer support, and server-side authorization.

## What the SQL does

### Physics

`physics_questions.sql` is an idempotent **create-or-upgrade** migration. It:

- creates `public.physics_questions` if it is missing, with a UUID `id` default,
  bilingual text/options, answer metadata, explanations, chapter/topic/section, difficulty,
  source PDF/page, text-array tags, and `created_at` / `updated_at` timestamps;
- adds missing importer/reader columns and constraints to an existing table;
- does **not** add a `subject` or `subject_area` column, and does not rewrite an existing
  opaque text/numeric `id` or its values;
- validates exactly A, B, C, D options, each with English or Hindi text;
- checks that the chapter is non-empty, at least one question language is non-empty, the
  answer key is A–D or null, the source page is positive, and tags contain at most 50 items;
- adds an `updated_at` trigger;
- enables RLS and grants `SELECT` only to `anon` and `authenticated`;
- creates a public-read policy and no client write policy or write grant;
- creates lookup and trigram indexes plus service-role table access.

Review the script in the Physics project's SQL editor before running it. The table is
documented as existing with zero readable rows and without `updated_at`; the upgrade path is
written for that case. If the existing table has different column names or invalid rows,
stop and reconcile it first rather than forcing the migration through.

### Chemistry

`chemistry_questions.sql` is a **new table** setup because the live probe returned
`PGRST205`. It:

- creates `public.chemistry_questions` with text, JSONB options, answer key,
  explanations, difficulty, source PDF/page, and text-array tags;
- validates exactly A, B, C, D options, each with English or Hindi text;
- fixes `subject` to `Chemistry`;
- checks that at least one question language is non-empty and the answer key is A–D or
  null;
- adds an `updated_at` trigger;
- enables RLS and grants `SELECT` only to `anon` and `authenticated`;
- creates a public-read policy and no client write policy or write grant;
- creates lookup and trigram indexes plus service-role table access.

Review the script in the Chemistry project's SQL editor before running it. If a previous
draft of this table already exists, inspect that table first instead of assuming this
script's columns are already present.

### Existing other tables

`biology_questions.sql`, `general_question_bank.sql`, and `archive_question_bank.sql` do
**not** create or replace their existing tables. They:

- enable RLS;
- revoke all client table privileges, then grant `SELECT` only to `anon` and
  `authenticated`;
- grant all table privileges to `service_role`;
- drop and recreate only the named public-read policy;
- create no client write policy or write grant;
- add lookup and question-text trigram indexes for admin filtering/pagination.

They assume the reader contract columns exist: `id`, `question_code`, `chapter`, `topic`,
`section`, `exercise`, `question_en`, `question_hi`, `options`, `answer_key`,
`answer_key_source`, `explanation_en`, `explanation_hi`, `difficulty`, `source_pdf`,
`source_page`, `tags`, and, where applicable, `subject` or `subject_area`. If an existing
table uses different names, stop and reconcile it before running the script. A missing
column will make the script fail instead of silently changing the app.

The Chemistry table and a newly created Physics table use UUID IDs. An already-existing
Physics table may use its current opaque text or numeric IDs; the Physics migration preserves
that ID type and does not rewrite existing values. The admin API validates the ID shape only
for Chemistry.

## Manual activation steps

Do these in order. Each SQL step must be run in the matching Supabase project, not in the
main project.

### 1. Confirm the main project admin setup

The current main deployment already has the admin migration. For a new deployment,
follow [../ADMIN_SETUP.md](../ADMIN_SETUP.md) and do not rerun a non-idempotent migration.

Confirm the first admin UUID is in `public.admin_users` and that the signed-in account
passes `public.is_admin()`.

### 2. Apply the Chemistry table SQL

In the **Chemistry** project SQL editor:

1. Open `supabase/remote/chemistry_questions.sql`.
2. Review the schema, checks, grants, policy, and indexes.
3. Run it once.
4. Verify the table appears in the Table Editor and the Data API can read it with the
   Chemistry publishable key.

Do not place the Chemistry service-role key in a `VITE_*` value.

### 3. Review and apply the Physics and existing-bank SQL

Open each matching script in its own project, confirm the table and columns, then run it:

- Physics: `physics_questions.sql` — create-or-upgrade; review the schema, checks, trigger,
  grants, policy, and indexes before running;
- Biology: `biology_questions.sql` — read-only hardening;
- General: `general_question_bank.sql` — read-only hardening;
- Archive: `archive_question_bank.sql` — read-only hardening.

The Physics script is a schema migration as well as a security/index update. The other three
are idempotent for their named policies and indexes, but they are not general schema
migrations. Do not run any script against the wrong project. Record the actual result in your
deployment notes.

### 4. Configure server-only credentials

Copy `.env.server.example` to `.env.server`:

```powershell
Copy-Item .env.server.example .env.server
```

Fill:

- `OINKIE_MAIN_SUPABASE_URL`
- `OINKIE_MAIN_SUPABASE_PUBLISHABLE_KEY`
- the URL and service-role key for each remote bank you want to manage

Do not fill a remote key you have not generated or reviewed. An unconfigured source is
reported as **server setup needed**. It is never routed to another project.

For production, store these values in the hosting platform's secret manager. Keep
`.env.server` out of Git. Never create `VITE_*SERVICE_ROLE*` or equivalent frontend
variables.

### 5. Run or deploy the trusted API

Local:

```powershell
npm run dev
```

The web app is on port 3000 and the API on port 3001 by default; Vite proxies `/api`.

Production:

```powershell
npm run build
npm start
```

The build produces:

- `dist/` — static frontend
- `dist-server/server.js` — bundled Node API and static server

Run the Node process with the server-only environment above. Keep it running across
requests. Serve the app and `/api` from the same origin where possible. If the API is on
another origin, set `VITE_ADMIN_API_BASE_URL` to the API's `/api` base and configure TLS
and reverse-proxy policy deliberately; the API does not include permissive CORS.

### 6. Verify the first admin write

1. Sign in to the main app as an allowlisted admin.
2. Open **Admin Controls → Question Banks**.
3. Confirm exactly five primary cards appear: Physics, Chemistry, Botany, Zoology, and PYQs.
   General and Archive must appear only in the secondary **Other registered banks** area.
   Hermetic tests cannot verify live counts: configure the server credentials and trusted API,
   then check each configured card's specific state. Chemistry must show **missing table** until
   step 2 is complete. PYQs must show **setup required**, not a count or a fallback table.
4. Open Botany, confirm the route is `biology_questions` with `subject_area = Botany`, then open
   Zoology and confirm the same table with `subject_area = Zoology`. Try a mismatched template or
   crafted request and confirm the server rejects it.
5. Pick one configured source and create a clearly labelled canary question. Confirm the count/status
   refresh and the row appears after reload.
6. Edit the canary, confirm the change, then delete it with the confirmation dialog.
7. Download that section's JSON template, confirm it is a real `.json` file, and import it unchanged
   through **Import JSON**. Verify the preview and that the template passes validation. Cancel once
   before confirming to prove no write occurred.
8. Confirm a normal student account cannot call the admin API successfully.
9. Import a two-record test file with one valid and one invalid record. Verify the preview shows both,
   the confirm action is unavailable until the invalid record is fixed, and no write happens. Then
   test an all-valid file and confirm no write happens before the final confirmation. Confirm the
   count refreshes and any batch/row failures are reported without overwriting existing rows.
10. Remove the canary and any test import rows.

Do not use real student or live exam content for the first write test.

## Security invariants

- `admin_users` and `public.is_admin()` remain the sole owner source of truth.
- The main-project access token is verified through `/auth/v1/user`; the caller's UUID,
  email, or role in a request body is not trusted.
- The `is_admin()` RPC is called with the user's token, not with a service-role key.
- Remote service-role keys exist only in the Node server environment.
- Every write checks the selected table and `adminSection` against the registry. A source,
  table, or subject mismatch is rejected.
- Biology update/delete queries are scoped by `subject_area`; Botany and Zoology cannot be
  collapsed into an unfiltered shared-table write.
- PYQs have no write route until a verified remote source and schema are approved. They never
  fall back to General, Archive, Chemistry, Biology, Physics, or another subject table.
- There is no browser fallback, public write policy, frontend-only admin check, or
  service-role key in a `VITE_*` variable.
- Failed counts, missing tables, permission errors, and unconfigured projects are
  reported separately from a verified zero.
- Public reads, dashboard content editors, the normal exam workflow, and student
  dashboards are unchanged.

## Rollback notes

The scripts do not drop tables, truncate rows, or replace question content. If a
read-policy/index change must be reverted, do it manually in the same project after
checking the project's prior policy and index definitions. The Chemistry script and the
Physics create-or-upgrade path can create a table when it is missing; dropping either table
would delete all of its rows and is not an automatic rollback. The Physics script never
converts an existing ID type or rewrites existing IDs.
