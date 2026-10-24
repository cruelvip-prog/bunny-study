-- OINKIE Study — Botany project SQL.
--
-- Target Supabase project:
--   Browser reader: VITE_SUPABASE_BIOLOGY_URL /
--                   VITE_SUPABASE_BIOLOGY_PUBLISHABLE_KEY
--   Trusted server: OINKIE_BIOLOGY_SUPABASE_URL /
--                   OINKIE_BIOLOGY_SUPABASE_SERVICE_ROLE_KEY
--
-- Target table: public.botany_questions
--
-- This migration creates or upgrades the independent Botany question table.
-- It does not drop, truncate, or rewrite question rows.

begin;

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- Options validation.
create or replace function public.botany_options_are_valid(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $function$
  select case
    when value is null or pg_catalog.jsonb_typeof(value) is distinct from 'object' then false
    else
      value ?& array['A', 'B', 'C', 'D']
      and (select count(*) from pg_catalog.jsonb_each(value)) = 4
      and not exists (
        select 1
        from pg_catalog.jsonb_each(value) as option(option_key, option_value)
        where pg_catalog.jsonb_typeof(option_value) is distinct from 'object'
          or not coalesce(
            (
              pg_catalog.jsonb_typeof(option_value -> 'text_en') = 'string'
              and pg_catalog.btrim(option_value ->> 'text_en') <> ''
            )
            or (
              pg_catalog.jsonb_typeof(option_value -> 'text_hi') = 'string'
              and pg_catalog.btrim(option_value ->> 'text_hi') <> ''
            ),
            false
          )
      )
  end;
$function$;

revoke all on function public.botany_options_are_valid(jsonb)
  from public, anon, authenticated;
grant execute on function public.botany_options_are_valid(jsonb)
  to service_role;

create table if not exists public.botany_questions (
  id uuid primary key default gen_random_uuid(),
  question_code text,
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
  constraint botany_questions_chapter_check check (
    chapter is not null and pg_catalog.btrim(chapter) <> ''
  ),
  constraint botany_questions_text_check check (
    pg_catalog.btrim(coalesce(question_en, '')) <> ''
    or pg_catalog.btrim(coalesce(question_hi, '')) <> ''
  ),
  constraint botany_questions_options_check check (
    public.botany_options_are_valid(options)
  ),
  constraint botany_questions_answer_key_check check (
    answer_key is null or answer_key in ('A', 'B', 'C', 'D')
  ),
  constraint botany_questions_source_page_check check (
    source_page is null or source_page > 0
  ),
  constraint botany_questions_tags_limit_check check (
    tags is not null and pg_catalog.cardinality(tags) <= 50
  )
);

-- Upgrade columns for a table created before this migration.
alter table public.botany_questions
  add column if not exists question_code text,
  add column if not exists chapter text not null default '',
  add column if not exists topic text,
  add column if not exists section text,
  add column if not exists exercise text,
  add column if not exists question_en text not null default '',
  add column if not exists question_hi text,
  add column if not exists options jsonb not null default '{}'::jsonb,
  add column if not exists answer_key text,
  add column if not exists answer_key_source text,
  add column if not exists explanation_en text,
  add column if not exists explanation_hi text,
  add column if not exists difficulty text,
  add column if not exists source_pdf text,
  add column if not exists source_page integer,
  add column if not exists tags text[] not null default '{}'::text[],
  add column if not exists created_at timestamptz not null default pg_catalog.now(),
  add column if not exists updated_at timestamptz not null default pg_catalog.now();

-- Preserve a unique question_code when one is supplied.
do $botany_question_code_unique$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.botany_questions'::regclass
      and conname = 'botany_questions_question_code_key'
  ) then
    alter table public.botany_questions
      add constraint botany_questions_question_code_key unique (question_code);
  end if;
end;
$botany_question_code_unique$;

-- Add named constraints when upgrading an older table.
do $botany_constraints$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.botany_questions'::regclass and conname = 'botany_questions_chapter_check') then
    alter table public.botany_questions add constraint botany_questions_chapter_check check (chapter is not null and pg_catalog.btrim(chapter) <> '');
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.botany_questions'::regclass and conname = 'botany_questions_text_check') then
    alter table public.botany_questions add constraint botany_questions_text_check check (pg_catalog.btrim(coalesce(question_en, '')) <> '' or pg_catalog.btrim(coalesce(question_hi, '')) <> '');
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.botany_questions'::regclass and conname = 'botany_questions_options_check') then
    alter table public.botany_questions add constraint botany_questions_options_check check (public.botany_options_are_valid(options));
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.botany_questions'::regclass and conname = 'botany_questions_answer_key_check') then
    alter table public.botany_questions add constraint botany_questions_answer_key_check check (answer_key is null or answer_key in ('A', 'B', 'C', 'D'));
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.botany_questions'::regclass and conname = 'botany_questions_source_page_check') then
    alter table public.botany_questions add constraint botany_questions_source_page_check check (source_page is null or source_page > 0);
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.botany_questions'::regclass and conname = 'botany_questions_tags_limit_check') then
    alter table public.botany_questions add constraint botany_questions_tags_limit_check check (tags is not null and pg_catalog.cardinality(tags) <= 50);
  end if;
end;
$botany_constraints$;

create or replace function public.set_botany_questions_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$function$;

revoke all on function public.set_botany_questions_updated_at()
  from public, anon, authenticated;
grant execute on function public.set_botany_questions_updated_at()
  to service_role;

drop trigger if exists botany_questions_prepare_updated_at
  on public.botany_questions;
create trigger botany_questions_prepare_updated_at
  before update on public.botany_questions
  for each row execute function public.set_botany_questions_updated_at();

alter table public.botany_questions enable row level security;

revoke all on table public.botany_questions from public, anon, authenticated;
grant select on table public.botany_questions to anon, authenticated;
grant all on table public.botany_questions to service_role;

do $botany_public_read_policy$
begin
  if not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'botany_questions'
      and cmd = 'SELECT'
      and roles && array['anon'::name, 'authenticated'::name]
  ) then
    create policy "OINKIE botany public read"
      on public.botany_questions
      for select
      to anon, authenticated
      using (true);
  end if;
end;
$botany_public_read_policy$;

create index if not exists botany_questions_chapter_topic_idx
  on public.botany_questions (chapter, topic);
create index if not exists botany_questions_section_exercise_idx
  on public.botany_questions (section, exercise);
create index if not exists botany_questions_difficulty_idx
  on public.botany_questions (difficulty);
create index if not exists botany_questions_source_pdf_idx
  on public.botany_questions (source_pdf);
create index if not exists botany_questions_question_en_trgm_idx
  on public.botany_questions using gin (question_en gin_trgm_ops);
create index if not exists botany_questions_question_hi_trgm_idx
  on public.botany_questions using gin (question_hi gin_trgm_ops);
create index if not exists botany_questions_question_code_trgm_idx
  on public.botany_questions using gin (question_code gin_trgm_ops);

commit;
```<|end|><|start|>write to=assistant<|channel|>analysis<|message|>Created file successfully: botany_questions.sql