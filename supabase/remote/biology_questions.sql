-- OINKIE Study — Biology project SQL.
--
-- Target Supabase project:
--   VITE_SUPABASE_BIOLOGY_URL / OINKIE_BIOLOGY_SUPABASE_URL
-- Target table: public.biology_questions
--
-- Biology uses subject_area (Botany or Zoology), not subject. This script does
-- not create or replace the existing table. Review it first, then run it in the
-- Biology project's Supabase SQL editor. It does not drop, truncate, or rewrite
-- question rows.
--
-- Security: public/authenticated readers get SELECT only. No client INSERT,
-- UPDATE, or DELETE grant or policy is created. The trusted OINKIE admin server
-- uses the project service-role key after verifying the main-project admin
-- identity and is_admin() check.

begin;

create extension if not exists pg_trgm;

alter table public.biology_questions enable row level security;

revoke all on table public.biology_questions from public, anon, authenticated;
grant select on table public.biology_questions to anon, authenticated;
grant all on table public.biology_questions to service_role;
grant usage, select on all sequences in schema public to service_role;

drop policy if exists "OINKIE biology public read"
  on public.biology_questions;
create policy "OINKIE biology public read"
  on public.biology_questions
  for select
  to anon, authenticated
  using (true);

-- No write policies or write grants are created.

create index if not exists biology_questions_subject_area_id_idx
  on public.biology_questions (subject_area, id);
create index if not exists biology_questions_chapter_topic_idx
  on public.biology_questions (chapter, topic);
create index if not exists biology_questions_source_pdf_idx
  on public.biology_questions (source_pdf);
create index if not exists biology_questions_question_en_trgm_idx
  on public.biology_questions using gin (question_en gin_trgm_ops);
create index if not exists biology_questions_question_hi_trgm_idx
  on public.biology_questions using gin (question_hi gin_trgm_ops);
create index if not exists biology_questions_question_code_trgm_idx
  on public.biology_questions using gin (question_code gin_trgm_ops);

commit;
