# NEET CBT Exam Simulator

An independent, local-first practice interface for NEET-style computer-based tests. This project is not an official NTA service and does not claim compliance with any current or historical NEET specification.

## Features

- Incomplete built-in demonstration paper, clearly labelled and never scored.
- Local PDF selection, PDF.js canvas viewing with the worker bundled by Vite, zoom, page navigation, and native-browser viewing fallback.
- Local JSON question-bank library, schema validation, searchable question previews, subject/topic filtering, and generated practice tests.
- KaTeX rendering for inline and display math in supported imported question, option, and review text.
- Shared exam timer, navigation palette, answer selection, review marking, autosaved progress, and results view.
- Absolute-deadline timer and validated session recovery. Session state is stored in browser `localStorage`; PDFs are stored in IndexedDB.
- Answer-key provenance is shown and respected. Imported keys are unscored unless the user explicitly attests to checking them against the cited source. Schema-valid or AI-generated content is not independently verified by the app.
- Keyboard shortcuts are available from the in-exam help control. Shortcuts are suppressed while using form controls or answer buttons.
- Dashboard navigation includes a NEET PYQ Tests page, CBT setup, PDF import, mock/custom tests, question banks, history/reports, analytics, revision, study planning, bookmarks, notes, flashcards, syllabus-topic tracking, weak topics, and completed-test streaks. No explicitly identified pre-built PYQ papers are bundled yet, so the PYQ page shows an empty state rather than sample or unrelated practice content.
- Bookmarks, notes, flashcards, study-plan tasks, and checked syllabus topics are stored locally in the browser. History-derived metrics and streaks use saved completed tests only; weak-topic analysis requires scored, topic-tagged questions.
- Account-based admin controls let an explicitly allowlisted Supabase user manage dashboard quick actions, notifications, quick links, and NEET YouTube resources. The same admin panel includes a unified Question Bank Manager with exactly five primary sections — Physics, Chemistry, Botany, Zoology, and PYQs — plus secondary General/Archive access: verified counts, filtered/paginated lists, validated add/edit, confirmed delete, and previewed JSON import/template export. PYQs stay setup-required until a verified remote source exists. Dashboard content stays protected by Postgres RLS. Cross-project question writes go through a trusted Node API that verifies the main-project session and `is_admin()` on every request. No admin email, UUID, or service-role key is bundled into the frontend.

## Requirements and setup

Use a supported Node.js LTS version and npm. In PowerShell, open the project directory and run:

```powershell
npm install
npm run dev
```

`npm run dev` starts the Vite app on `http://localhost:3000` and the trusted admin API on
`http://127.0.0.1:3001`; Vite proxies `/api` to it. The app still loads if the admin API is not
configured, but question-bank writes and verified counts show an explicit setup error rather than
falling back to a browser credential. See [trusted admin API setup](#trusted-admin-api-setup).

To create and serve a production build:

```powershell
npm run build
npm start
```

`npm start` serves both `dist/` and the bundled admin API from the Node server. `npm run preview`
only previews the static Vite build and does not provide the admin API. The production output is
written to `dist/`; the server bundle is `dist-server/server.js`. Exam data, imported PDFs, question
banks, and study tools remain in local browser storage.

## Supabase authentication and profile setup

This app uses Supabase email/password authentication. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in a local `.env.local` file (the repository ignores local `.env` files), then restart Vite. Never place a Supabase service-role or secret key in frontend environment variables. The trusted admin API uses main-project variables from `.env.server` instead; see [trusted admin API setup](#trusted-admin-api-setup).

In Supabase Auth, enable the email provider and configure the Site URL and allowed redirect URLs for the local app and deployed origin. Configure email confirmation and password-recovery templates, and set up production SMTP for reliable delivery.

First-time authenticated users need a profile row. Review and manually apply the SQL in `supabase/migrations/20261021180000_create_profiles.sql` before expecting profile setup to succeed. The migration is not applied automatically by this app.

## Dashboard resources and account-based administration

Dashboard quick actions, notifications, quick links, and NEET YouTube resources are stored in Supabase. Signed-in students can read only active rows. The **Admin Controls** entry appears only when the signed-in Supabase user UUID is allowlisted in `public.admin_users`; the panel is rendered inside the existing app, not at a public `/admin` route. Postgres RLS enforces the allowlist on every dashboard-content read and write, so hiding the UI is not the security boundary. The **Question Banks** tab uses the trusted admin API for counts, lists, writes, deletes, and imports; it does not use a browser service key.

The main admin migration has already been applied in this workspace's existing deployment. For a new deployment, review and apply `supabase/migrations/20261022120000_create_admin_dashboard_content.sql` once, then enroll the admin UUID using the SQL in [supabase/ADMIN_SETUP.md](supabase/ADMIN_SETUP.md). Do not rerun the non-idempotent migration on the current deployment. Neither step is applied automatically by the app. If the migration is not present in a new deployment, the dashboard falls back to its built-in quick actions and quick links, and the admin check fails closed.

The frontend uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for the account project, plus the optional remote question-bank publishable-key variables described below. The trusted API reads main-project and remote service-role credentials from server-only variables. Never put an admin UUID, a service-role key, or another secret in frontend code or a `VITE_*` variable. A published YouTube resource should be reviewed before activation and contain its actual title, creator, canonical YouTube URL, and optional thumbnail URL; the app does not invent trend or engagement data.

The syllabus tracker is a user checklist over the subject/topic labels found in locally saved question banks, not a claim to contain or certify the complete official NEET syllabus. Practice streaks are based on local completed-test timestamps, and analytics do not include unfinished sessions.

### Optional remote question-bank projects

The Custom Test Generator can read from five independent Supabase question-bank projects without changing or copying local question banks. Configure the matching `VITE_SUPABASE_PHYSICS_URL` / `VITE_SUPABASE_PHYSICS_PUBLISHABLE_KEY`, `VITE_SUPABASE_BIOLOGY_URL` / `VITE_SUPABASE_BIOLOGY_PUBLISHABLE_KEY`, `VITE_SUPABASE_CHEMISTRY_URL` / `VITE_SUPABASE_CHEMISTRY_PUBLISHABLE_KEY`, `VITE_SUPABASE_GENERAL_URL` / `VITE_SUPABASE_GENERAL_PUBLISHABLE_KEY`, and `VITE_SUPABASE_ARCHIVE_URL` / `VITE_SUPABASE_ARCHIVE_PUBLISHABLE_KEY` values in `.env.local`. These optional sources use publishable keys for read-only queries; never put a service-role or secret key in frontend environment variables. The remote tables must permit the configured read access under their existing policies. Remote data is not imported into local question-bank listings. A remote request is limited to 300 rows, and incompatible rows fail with an explicit error.

The Chemistry project maps to `public.chemistry_questions` and exposes Chemistry only. Its table is **not present** in the current live project (`PGRST205`), so Chemistry admin CRUD remains unavailable until the reviewed SQL is applied. The app reports the missing table rather than showing a zero count.

### Five-section admin Question Bank Manager

The **Question Banks** tab opens on exactly five primary buttons: **Physics**, **Chemistry**,
**Botany**, **Zoology**, and **PYQs**. The five buttons render even when the status API fails. Each
configured button opens its own destination view with a clear **Back to all sections** action.
General and Archive remain reachable through the secondary **Other registered banks** area; they are
not primary buttons and do not substitute for any of the five sections.

| Primary section | Registered project table | Subject contract | ID kind |
| --- | --- | --- | --- |
| Physics | `public.physics_questions` | No subject write column; the table identifies Physics | opaque validation; new table uses UUID |
| Chemistry | `public.chemistry_questions` | `subject` fixed to Chemistry | UUID |
| Botany | `public.biology_questions` | `subject_area` fixed to Botany | opaque text/number |
| Zoology | `public.biology_questions` | `subject_area` fixed to Zoology | opaque text/number |
| PYQs | No verified remote table | **Setup required**; never routed to another bank | — |

Each configured section shows its exact source, table, subject lock, last-checked time, and a verified
count/state (`connected`, `connected · empty`, `missing table`, `permission denied`, `unavailable`, or
`server setup needed`). A failed count is never converted to zero. A shared Biology count is labelled
as the whole Biology table, while the list is filtered to the selected Botany or Zoology subject.

Selecting a primary section sends `adminSection` with list, create, update, delete, and import
requests. The separate existing `section` list parameter still filters the question's own section
field. The server resolves `adminSection` from the registry, rejects a source or table mismatch, forces
the subject lock for Biology and Chemistry, and scopes update/delete repository requests by
`subject_area` or `subject`. The shared Biology source requires a Botany or Zoology section before
create, update, delete, or import; there is no unfiltered write path.

Add/edit displays and persists every verified schema field, including bilingual question text,
four A–D options, answer source, explanations, difficulty, source PDF/page, tags, and chapter/topic/
section/exercise metadata. Chemistry IDs must be UUIDs. Delete requires a browser confirmation and
reports the actual destination.

**Import JSON** and **Download JSON Template** sit together in each configured section view. Downloaded
templates use the versioned `oinkie-question-bank-template` envelope with `schema_version: "1.0"`,
destination source/table/subject metadata, field documentation, and one complete bilingual sample
question. The same production importer validates the downloaded file. Imports accept the template, a
JSON array, an object with a `questions` array, or a compatible local bank export. The browser previews
valid, invalid, and sample records before confirmation; the server validates the full payload again,
inserts in batches of 25, never overwrites existing rows, and reports partial failures. The limits are
1,000 records and 20 MiB per file, with cancellation available before the write.

**PYQs remain setup-required.** The only existing PYQ feature is the local NEET PYQ Tests page, which
reads root-level `pyqPaper` metadata from locally saved banks. That local paper catalog has no remote
exam/year/question admin schema. The PYQs view therefore exposes no add, edit, delete, import,
template, or status action until an approved source-specific table, identifier model, public reader,
and migration are verified.

Image metadata is supported in the shared admin JSON format. Embedded data URIs are validated and
uploaded through the trusted server API to the configured `question-bank-images` bucket, while
existing HTTP(S) image URLs are preserved. The admin preview and question renderer display question,
option, and explanation images after persistence and reload.

Read-only live probes on 2026-10-22 found Physics, Biology, General, and Archive reachable over HTTP
200 with zero readable rows, and confirmed their reader columns (`id`, `question_code`, `chapter`,
`topic`, `section`, `exercise`, `question_en`, `question_hi`, `options`, `answer_key`,
`answer_key_source`, `explanation_en`, `explanation_hi`, `difficulty`, `source_pdf`, `source_page`,
`tags`, `created_at`). Chemistry returned HTTP 404 / `PGRST205` because
`public.chemistry_questions` is missing. No live writes were performed by this change. Verified admin
counts and CRUD require the server-only credentials and trusted Node API to be configured.

### Trusted admin API setup

Cross-project writes cannot be safely authorized by a remote publishable key or by frontend code.
The repository therefore includes a small Express server. On every request it:

1. Reads the signed-in main-project access token from `Authorization: Bearer ...`.
2. Calls the main project's `/auth/v1/user` endpoint with the main publishable key.
3. Calls the main project's `public.is_admin()` RPC with that same user token.
4. Only after that succeeds, uses the selected source's server-only service-role client.
5. Resolves the destination project and table only from the centralized registry.

Copy `.env.server.example` to `.env.server` and fill only the projects you intend to manage:

```text
OINKIE_MAIN_SUPABASE_URL
OINKIE_MAIN_SUPABASE_PUBLISHABLE_KEY
OINKIE_PHYSICS_SUPABASE_URL
OINKIE_PHYSICS_SUPABASE_SERVICE_ROLE_KEY
OINKIE_BIOLOGY_SUPABASE_URL
OINKIE_BIOLOGY_SUPABASE_SERVICE_ROLE_KEY
OINKIE_CHEMISTRY_SUPABASE_URL
OINKIE_CHEMISTRY_SUPABASE_SERVICE_ROLE_KEY
OINKIE_GENERAL_SUPABASE_URL
OINKIE_GENERAL_SUPABASE_SERVICE_ROLE_KEY
OINKIE_ARCHIVE_SUPABASE_URL
OINKIE_ARCHIVE_SUPABASE_SERVICE_ROLE_KEY
PORT=3001
```

`.env.server` is ignored by Git. Keep service-role keys in a deployment secret manager, not in the
repository, browser, logs, screenshots, or chat. Unconfigured sources show **server setup needed**;
they do not use another project's credentials.

Local development:

```powershell
npm run dev
```

Production build and serve:

```powershell
npm run build
npm start
```

Deploy `dist/` and `dist-server/server.js` plus a persistent Node process and the server-only
environment. The safest production layout serves the app and `/api` from the same origin through one
reverse proxy. If the API is on another origin, set the frontend `VITE_ADMIN_API_BASE_URL` to its
`/api` base and configure TLS/reverse-proxy headers appropriately; the API has no permissive CORS
middleware.

The project-specific SQL review and manual activation checklist is in
[supabase/remote/README.md](supabase/remote/README.md). This repository does not execute SQL, deploy
the API, or write live question rows automatically.

## Importing a question bank

In Test Setup, choose **Imported Question Bank** and select a local `.json` file. The app parses the file in the browser and does not upload it. It accepts legacy schema version `"1.0"` and schema v2 (`schemaVersion: 2`) and validates the full question list before making the bank available. Valid imports are saved in IndexedDB and can be selected for later tests on the same device/browser; legacy localStorage records remain readable. If any question is invalid, the import is rejected and the reported errors identify the field and question index. Browser storage can be cleared, restricted, or unavailable; keep an independent copy of each source file.

Schema v2 questions keep their original fields and unknown metadata in the normalized saved bank. `languages.en` and `languages.hi` remain language-specific data on one question with one unchanged `id`; the existing internal English/Hindi fields are populated where representable, but the app does not currently provide a language selector. Both supported schemas store one answer key per question ID, shared by its English and Hindi content; the internal key remains A/B/C/D regardless of the displayed option labels. The v2 mapper accepts four options as A-D keyed values or four `{ id, text }` / `{ optionId, text }` option records. A single answer letter or option ID is mapped to the corresponding internal A-D key. Multiple-answer or otherwise unsupported answer encodings are preserved and marked for review instead of being scored. V2 marks and negative marks are preserved as metadata; scoring remains +4/−1/0. Embedded data URIs and HTTP(S) image URLs can be displayed when recognized. Local file paths are not treated as image bytes; unresolved image references are retained in source metadata and shown as import notes.

The supported top-level structure contains:

- `schema_version`: exactly `"1.0"` (legacy format; still supported).
- `source_pdf`: object with non-empty `file_name` and `subject`, plus positive integer `total_pages`.
- `image_assets`: array of image metadata. Embedded assets contain a unique `id`, `type` (`question`, `option`, or `explanation`), `mimeType` (`image/png`, `image/jpeg`, `image/webp`, or `image/gif`), complete Base64 `dataUri`, `alt`, and nullable `caption`.
- `questions`: non-empty array of objects containing a unique `id`, positive `question_number`, non-empty `chapter`, `exercise`, `section`, and `question_en`, a `source_page` within the PDF page count, optional nullable `question_code` and `question_hi`, exactly four `options` (`A`–`D`, each with non-empty `text_en` and nullable `text_hi`), nullable `answer_key` (`A`–`D`), nullable `answer_key_source`, string arrays `formulas`, `review_flags`, and `missing_content`, and an `images` object with nullable question and option asset IDs. `images.explanation` can reference an explanation image; `explanation_en` and `explanation_hi` are optional text fields.

For example, set `images.question_en` to the ID of a `type: "question"` asset, an option slot to the ID of a `type: "option"` asset, and `images.explanation` to a `type: "explanation"` asset. The full metadata object or a complete `data:image/...;base64,...` URI may instead be placed directly in the corresponding question image slot. Do not put prompts, filenames, or shortened/example Base64 in `dataUri`: it must contain the complete bytes of the actual image. Images are checked for Base64 structure, supported MIME type, matching raster-image signature, size, and browser decoding. The importer has no fixed JSON file-size limit, while embedded images are limited by `QUESTION_BANK_MAX_IMAGE_BYTES` (20 MiB per image) and `QUESTION_BANK_MAX_TOTAL_IMAGE_BYTES` (70 MiB total). Actual processing capacity and available browser storage remain dependent on the device/browser. Imported source files are stored as Blobs in IndexedDB, avoiding localStorage's small quota; embedded image bytes stay in that durable source file. Legacy banks in localStorage remain readable. Legacy asset `path` and HTTP(S) `url` references remain supported when available, but are external dependencies rather than self-contained images.

The JSON file is parsed and schema-validated in a Web Worker so the main interface can remain responsive. This is asynchronous worker-based validation, not streaming JSON parsing: the worker reads and parses the complete file. Very low-memory devices may not be able to process exceptionally large banks, and browser storage quotas can prevent saving them. In those cases, split the source into smaller JSON banks or reduce embedded image size/count; imports are rejected atomically and never truncated.

Duplicate IDs and duplicate question text/options are rejected. Text, formulas, answer text, and embedded images are preserved through bank import, saved-bank reload/export, question previews, exam recovery, and exam reports. Text and formula strings are preserved, but the simulator does not independently verify transcription, citations, formulas, or answer keys. The question-bank screen provides a valid text-only JSON template and a field guide; the template intentionally contains no fake or incomplete image bytes.

After import, review the summary and question preview, search and filter by subject/topic, choose a question count that does not exceed the matching questions, and optionally randomize the selection. Difficulty filtering is not available yet; schema v2 difficulty metadata is preserved. Starting a test does not clear the current session unless the new test can be initialized. Closing or reloading the tab may recover an unfinished session from local browser storage; clearing site data removes that recovery data.

The NEET PYQ Tests page lists only saved banks that explicitly include root-level `pyqPaper` metadata with `type: "neet-pyq"`, a numeric `year`, and a `title`. Optional `session`, `durationMinutes`, and `marks` are displayed only when supplied; starting a paper requires its duration. The subjects and question count are derived from the bank's actual questions. The bundled demo and Allen study-module sample are not identified as NEET PYQ papers and are not listed.

Imported question and option text may include inline math delimited by `$...$` or `\(...\)`, and display math delimited by `$$...$$` or `\[...\]`. Malformed expressions are shown as their original text. Raw imported HTML is not executed. English/Hindi explanation fields are supported by the remote admin tables; the local legacy/v2 import screens do not currently display them as part of their saved-bank review.

### Answer-key status and scoring

- Built-in demo content is incomplete and unscored.
- An imported bank answer key begins as source-cited but unverified and is not scored.
- Before a bank test, the user can attest that they checked the selected questions and keys against the cited original source. This is a user assertion, not authentication by the software.
- A key pasted by the user is labelled user-provided. The app can apply the simulator's `+4 / -1 / 0` scoring to questions with available authorized keys; it does not establish whether the key itself is correct.
- AI-generated or extracted draft content requires human source review. Passing schema validation only establishes structural compatibility.

## Tests and checks

```powershell
npm test
npm run lint
npm run build
node --test .\tests\convert-allen-pdf.test.mjs
node --check .\convert-allen-pdf.mjs
node .\convert-allen-pdf.mjs --validate-bank .\sample_output\sample_physics_bank.json
```

The app workflow tests cover import validation, embedded-image metadata and malformed data, image-size limits, acceptance above the previous 4 MiB ceiling, storage-quota messaging, duplicate questions, search/filtering, randomized test generation, local bank persistence and JSON re-import, math rendering fallback, answer-key status, scoring, session restoration, timer clamping, and malformed JSON answer keys. The question-bank admin tests additionally cover the exact five-source registry, the five primary admin sections and their source/subject mappings, Botany/Zoology subject scopes on list/update/delete/import, the required section for shared Biology writes, PYQ setup rejection, source/table mismatch rejection, source-specific UUID validation, all status states, pagination/filter validation, downloaded-template validity through the real importer, template destination/schema mismatch rejection, full-payload-before-write import validation, partial import failure reporting, main-project session/`is_admin()` verification, an authorization failure blocking writes before the service, and missing server configuration. The extraction tests exercise the local pipeline's focused safeguards; running them does not perform a PDF extraction.

## Offline and privacy notes

Question-bank parsing and exam state operate in the browser; exam recovery uses local browser storage. The PDF.js worker is bundled locally. When served from a local production build, the app's static resources are local, but complete offline behavior has not been verified across browsers and hosting environments. A remotely hosted app still needs network access to load the site initially. A selected external PDF URL, if supplied by the browser, may itself require a network connection. Browser storage can be cleared, restricted, or unavailable; keep independent copies of source PDFs and banks.

## Optional local PDF extraction draft

`convert-allen-pdf.mjs` uses PDF.js and a local Ollama endpoint to produce draft extraction outputs. It requires explicit configuration and does not validate source accuracy or answer correctness. It is separate from the browser app. Do not run it unless you intend to contact the configured local model and create extraction output files.

Example PowerShell configuration:

```powershell
$env:ALLEN_PDF_PATH = 'C:\path\to\source.pdf'
$env:ALLEN_SUBJECT = 'Physics'
$env:ALLEN_MODEL = 'qwen-local'
$env:ALLEN_OLLAMA_URL = 'http://127.0.0.1:11434/api/generate'
$env:ALLEN_OUT_DIR = '.\allen_physics_output'
$env:ALLEN_MAX_PAGES = '0'
node .\convert-allen-pdf.mjs
```

`ALLEN_SUBJECT`, `ALLEN_PDF_PATH`, `ALLEN_MODEL`, `ALLEN_OLLAMA_URL`, and `ALLEN_OUT_DIR` are configurable. `ALLEN_MAX_PAGES=0` processes all pages; a positive value limits the run. `ALLEN_REQUEST_TIMEOUT_MS` defaults to `120000`; `ALLEN_RETRY_FAILED=false` disables retrying failed checkpoint pages. Successful outcomes are reused, while failed or structurally invalid outputs can be retried. Checkpoints are appended. Existing question/report outputs are preserved and subsequent outputs use unique versioned names. Extracted questions remain drafts requiring human review.

Validate the supplied sample bank without modifying it:

```powershell
node .\convert-allen-pdf.mjs --validate-bank .\sample_output\sample_physics_bank.json
```
