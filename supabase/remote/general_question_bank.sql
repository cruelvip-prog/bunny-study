-- OINKIE Study — General project SQL.
--
-- Target Supabase project:
--   VITE_SUPABASE_GENERAL_URL / OINKIE_GENERAL_SUPABASE_URL
-- Target table: public.question_bank
--
-- The General bank keeps its existing meaning and table. It uses subject with
-- Physics, Chemistry, Botany, or Zoology and remains mixed-subject. This script
-- does not create or replace the table. Review it first, then run it in the
-- General project's Supabase SQL editor. It does not drop, truncate, or rewrite
-- question rows.
--
-- Security: public/authenticated readers get SELECT only. No client INSERT,
-- UPDATE, or DELETE grant or policy is created. The trusted OINKIE admin server
-- uses the project service-role key after verifying the main-project admin
-- identity and is_admin() check.

begin;

create extension if not exists pg_trgm;

alter table public.question_bank enable row level security;

revoke all on table public.question_bank from public, anon, authenticated;
grant select on table public.question_bank to anon, authenticated;
grant all on table public.question_bank to service_role;
grant usage, select on all sequences in schema public to service_role;

drop policy if exists "OINKIE general public read"
  on public.question_bank;
create policy "OINKIE general public read"
  on public.question_bank
  for select
  to anon, authenticated
  using (true);

-- No write policies or write grants are created.

create index if not exists question_bank_subject_id_idx
  on public.question_bank (subject, id);
create index if not exists question_bank_chapter_topic_idx
  on public.question_bank (chapter, topic);
create index if not exists question_bank_source_pdf_idx
  on public.question_bank (source_pdf);
create index if not exists question_bank_question_en_trgm_idx
  on public.question_bank using gin (question_en gin_trgm_ops);
create index if not exists question_bank_question_hi_trgm_idx
  on public.question_bank using gin (question_hi gin_trgm_ops);
create index if not exists question_bank_question_code_trgm_idx
  on public.question_bank using gin (question_code gin_trgm_ops);

commit;
