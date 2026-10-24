-- OINKIE Study — Archive project SQL.
--
-- Target Supabase project:
--   VITE_SUPABASE_ARCHIVE_URL / OINKIE_ARCHIVE_SUPABASE_URL
-- Target table: public.question_bank_archive
--
-- The Archive bank keeps its existing meaning and table. It uses subject with
-- Physics, Chemistry, Botany, or Zoology. This script does not create or
-- replace the table. Review it first, then run it in the Archive project's
-- Supabase SQL editor. It does not drop, truncate, or rewrite question rows.
--
-- Security: public/authenticated readers get SELECT only. No client INSERT,
-- UPDATE, or DELETE grant or policy is created. The trusted OINKIE admin server
-- uses the project service-role key after verifying the main-project admin
-- identity and is_admin() check.

begin;

create extension if not exists pg_trgm;

alter table public.question_bank_archive enable row level security;

revoke all on table public.question_bank_archive from public, anon, authenticated;
grant select on table public.question_bank_archive to anon, authenticated;
grant all on table public.question_bank_archive to service_role;
grant usage, select on all sequences in schema public to service_role;

drop policy if exists "OINKIE archive public read"
  on public.question_bank_archive;
create policy "OINKIE archive public read"
  on public.question_bank_archive
  for select
  to anon, authenticated
  using (true);

-- No write policies or write grants are created.

create index if not exists question_bank_archive_subject_id_idx
  on public.question_bank_archive (subject, id);
create index if not exists question_bank_archive_chapter_topic_idx
  on public.question_bank_archive (chapter, topic);
create index if not exists question_bank_archive_source_pdf_idx
  on public.question_bank_archive (source_pdf);
create index if not exists question_bank_archive_question_en_trgm_idx
  on public.question_bank_archive using gin (question_en gin_trgm_ops);
create index if not exists question_bank_archive_question_hi_trgm_idx
  on public.question_bank_archive using gin (question_hi gin_trgm_ops);
create index if not exists question_bank_archive_question_code_trgm_idx
  on public.question_bank_archive using gin (question_code gin_trgm_ops);

commit;
