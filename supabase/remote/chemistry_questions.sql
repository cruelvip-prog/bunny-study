-- OINKIE Study — Chemistry project SQL.
--
-- Target Supabase project:
--   The project configured by VITE_SUPABASE_CHEMISTRY_URL in the frontend and
--   OINKIE_CHEMISTRY_SUPABASE_URL / OINKIE_CHEMISTRY_SUPABASE_SERVICE_ROLE_KEY
--   in the trusted server environment.
--
-- Target table: public.chemistry_questions
--
-- This is a NEW table setup because the live probe returned PGRST205 ("table
-- not found"). Do not assume a previous draft exists. Review this script in the
-- Supabase SQL editor before running it. It does not drop, truncate, or replace
-- any table or row.
--
-- Security model:
--   * Anonymous and ordinary authenticated users can SELECT rows (public reader).
--   * There is no INSERT/UPDATE/DELETE policy and no client write grant.
--   * The trusted admin server uses the project service-role key, which bypasses
--     RLS. The server verifies the main-project admin session before every write.
--
-- The options JSON contract contains exactly A, B, C, and D. Each option is an
-- object with text_en and/or text_hi. This matches the existing reader and the
-- admin form.

begin;

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create or replace function public.chemistry_options_are_valid(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $function$
  select case
    when value is null or jsonb_typeof(value) is distinct from 'object' then false
    else coalesce(
    value ?& array['A', 'B', 'C', 'D']
    and (select count(*) from jsonb_object_keys(value)) = 4
    and coalesce(jsonb_typeof(value -> 'A') = 'object', false)
    and (
      (
        coalesce(jsonb_typeof(value -> 'A' -> 'text_en') = 'string', false)
        and pg_catalog.btrim(value -> 'A' ->> 'text_en') <> ''
      )
      or (
        coalesce(jsonb_typeof(value -> 'A' -> 'text_hi') = 'string', false)
        and pg_catalog.btrim(value -> 'A' ->> 'text_hi') <> ''
      )
    )
    and coalesce(jsonb_typeof(value -> 'B') = 'object', false)
    and (
      (
        coalesce(jsonb_typeof(value -> 'B' -> 'text_en') = 'string', false)
        and pg_catalog.btrim(value -> 'B' ->> 'text_en') <> ''
      )
      or (
        coalesce(jsonb_typeof(value -> 'B' -> 'text_hi') = 'string', false)
        and pg_catalog.btrim(value -> 'B' ->> 'text_hi') <> ''
      )
    )
    and coalesce(jsonb_typeof(value -> 'C') = 'object', false)
    and (
      (
        coalesce(jsonb_typeof(value -> 'C' -> 'text_en') = 'string', false)
        and pg_catalog.btrim(value -> 'C' ->> 'text_en') <> ''
      )
      or (
        coalesce(jsonb_typeof(value -> 'C' -> 'text_hi') = 'string', false)
        and pg_catalog.btrim(value -> 'C' ->> 'text_hi') <> ''
      )
    )
    and coalesce(jsonb_typeof(value -> 'D') = 'object', false)
    and (
      (
        coalesce(jsonb_typeof(value -> 'D' -> 'text_en') = 'string', false)
        and pg_catalog.btrim(value -> 'D' ->> 'text_en') <> ''
      )
      or (
        coalesce(jsonb_typeof(value -> 'D' -> 'text_hi') = 'string', false)
        and pg_catalog.btrim(value -> 'D' ->> 'text_hi') <> ''
      )
    ),
    false
  )
  end;
$function$;

revoke all on function public.chemistry_options_are_valid(jsonb) from public, anon, authenticated;
grant execute on function public.chemistry_options_are_valid(jsonb) to service_role;

create table if not exists public.chemistry_questions (
  id uuid primary key default gen_random_uuid(),
  question_code text,
  subject text not null default 'Chemistry',
  chapter text not null,
  topic text,
  section text,
  exercise text,
  question_en text not null default '',
  question_hi text,
  options jsonb not null,
  answer_key text,
  answer_key_source text,
  explanation_en text,
  explanation_hi text,
  difficulty text,
  source_pdf text,
  source_page integer,
  tags text[] not null default '{}'::text[],
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint chemistry_questions_subject_check check (subject = 'Chemistry'),
  constraint chemistry_questions_text_check check (
    pg_catalog.btrim(question_en) <> ''
    or pg_catalog.btrim(coalesce(question_hi, '')) <> ''
  ),
  constraint chemistry_questions_options_check check (
    public.chemistry_options_are_valid(options)
  ),
  constraint chemistry_questions_answer_key_check check (
    answer_key is null or answer_key in ('A', 'B', 'C', 'D')
  ),
  constraint chemistry_questions_source_page_check check (
    source_page is null or source_page > 0
  )
);

comment on table public.chemistry_questions is
  'OINKIE Chemistry question bank. Public read-only; admin writes only through the trusted OINKIE server after main-project is_admin() verification.';
comment on column public.chemistry_questions.options is
  'JSON object with exactly A, B, C, D. Each value is { "text_en": string, "text_hi": string|null }.';
comment on column public.chemistry_questions.subject is
  'Fixed Chemistry source discriminator. The reader also forces Chemistry.';

create or replace function public.set_chemistry_questions_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$function$;

revoke all on function public.set_chemistry_questions_updated_at()
  from public, anon, authenticated;

drop trigger if exists chemistry_questions_prepare_updated_at
  on public.chemistry_questions;
create trigger chemistry_questions_prepare_updated_at
  before update on public.chemistry_questions
  for each row execute function public.set_chemistry_questions_updated_at();

alter table public.chemistry_questions enable row level security;

revoke all on table public.chemistry_questions from public, anon, authenticated;
grant select on table public.chemistry_questions to anon, authenticated;
grant all on table public.chemistry_questions to service_role;

drop policy if exists "OINKIE chemistry public read"
  on public.chemistry_questions;
create policy "OINKIE chemistry public read"
  on public.chemistry_questions
  for select
  to anon, authenticated
  using (true);

-- No INSERT, UPDATE, or DELETE policies are created. Client roles have no write grants.

create index if not exists chemistry_questions_subject_id_idx
  on public.chemistry_questions (subject, id);
create index if not exists chemistry_questions_chapter_topic_idx
  on public.chemistry_questions (chapter, topic);
create index if not exists chemistry_questions_source_pdf_idx
  on public.chemistry_questions (source_pdf);
create index if not exists chemistry_questions_question_en_trgm_idx
  on public.chemistry_questions using gin (question_en gin_trgm_ops);
create index if not exists chemistry_questions_question_hi_trgm_idx
  on public.chemistry_questions using gin (question_hi gin_trgm_ops);
create index if not exists chemistry_questions_question_code_trgm_idx
  on public.chemistry_questions using gin (question_code gin_trgm_ops);

commit;
