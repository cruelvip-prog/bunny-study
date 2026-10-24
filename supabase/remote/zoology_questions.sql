-- OINKIE Study — Zoology project SQL.
--
-- Target Supabase project:
--   Browser reader: VITE_SUPABASE_BIOLOGY_URL /
--                   VITE_SUPABASE_BIOLOGY_PUBLISHABLE_KEY
--   Trusted server: OINKIE_BIOLOGY_SUPABASE_URL /
--                   OINKIE_BIOLOGY_SUPABASE_SERVICE_ROLE_KEY
--
-- Target table: public.zoology_questions
--
-- This migration creates or upgrades the independent Zoology question table.
-- It does not drop, truncate, or rewrite question rows.

begin;

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create or replace function public.zoology_options_are_valid(value jsonb)
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

revoke all on function public.zoology_options_are_valid(jsonb)
  from public, anon, authenticated;
grant execute on function public.zoology_options_are_valid(jsonb)
  to service_role;

create table if not exists public.zoology_questions (
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
  constraint zoology_questions_chapter_check check (
    chapter is not null and pg_catalog.btrim(chapter) <> ''
  ),
  constraint zoology_questions_text_check check (
    pg_catalog.btrim(coalesce(question_en, '')) <> ''
    or pg_catalog.btrim(coalesce(question_hi, '')) <> ''
  ),
  constraint zoology_questions_options_check check (
    public.zoology_options_are_valid(options)
  ),
  constraint zoology_questions_answer_key_check check (
    answer_key is null or answer_key in ('A', 'B', 'C', 'D')
  ),
  constraint zoology_questions_source_page_check check (
    source_page is null or source_page > 0
  ),
  constraint zoology_questions_tags_limit_check check (
    tags is not null and pg_catalog.cardinality(tags) <= 50
  )
);

alter table public.zoology_questions
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

do $zoology_question_code_unique$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.zoology_questions'::regclass
      and conname = 'zoology_questions_question_code_key'
  ) then
    alter table public.zoology_questions
      add constraint zoology_questions_question_code_key unique (question_code);
  end if;
end;
$zoology_question_code_unique$;

do $zoology_constraints$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.zoology_questions'::regclass and conname = 'zoology_questions_chapter_check') then
    alter table public.zoology_questions add constraint zoology_questions_chapter_check check (chapter is not null and pg_catalog.btrim(chapter) <> '');
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.zoology_questions'::regclass and conname = 'zoology_questions_text_check') then
    alter table public.zoology_questions add constraint zoology_questions_text_check check (pg_catalog.btrim(coalesce(question_en, '')) <> '' or pg_catalog.btrim(coalesce(question_hi, '')) <> '');
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.zoology_questions'::regclass and conname = 'zoology_questions_options_check') then
    alter table public.zoology_questions add constraint zoology_questions_options_check check (public.zoology_options_are_valid(options));
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.zoology_questions'::regclass and conname = 'zoology_questions_answer_key_check') then
    alter table public.zoology_questions add constraint zoology_questions_answer_key_check check (answer_key is null or answer_key in ('A', 'B', 'C', 'D'));
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.zoology_questions'::regclass and conname = 'zoology_questions_source_page_check') then
    alter table public.zoology_questions add constraint zoology_questions_source_page_check check (source_page is null or source_page > 0);
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.zoology_questions'::regclass and conname = 'zoology_questions_tags_limit_check') then
    alter table public.zoology_questions add constraint zoology_questions_tags_limit_check check (tags is not null and pg_catalog.cardinality(tags) <= 50);
  end if;
end;
$zoology_constraints$;

create or replace function public.set_zoology_questions_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$function$;

revoke all on function public.set_zoology_questions_updated_at()
  from public, anon, authenticated;
grant execute on function public.set_zoology_questions_updated_at()
  to service_role;

drop trigger if exists zoology_questions_prepare_updated_at
  on public.zoology_questions;
create trigger zoology_questions_prepare_updated_at
  before update on public.zoology_questions
  for each row execute function public.set_zoology_questions_updated_at();

alter table public.zoology_questions enable row level security;

revoke all on table public.zoology_questions from public, anon, authenticated;
grant select on table public.zoology_questions to anon, authenticated;
grant all on table public.zoology_questions to service_role;

do $zoology_public_read_policy$
begin
  if not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'zoology_questions'
      and cmd = 'SELECT'
      and roles && array['anon'::name, 'authenticated'::name]
  ) then
    create policy "OINKIE zoology public read"
      on public.zoology_questions
      for select
      to anon, authenticated
      using (true);
  end if;
end;
$zoology_public_read_policy$;

create index if not exists zoology_questions_chapter_topic_idx
  on public.zoology_questions (chapter, topic);
create index if not exists zoology_questions_section_exercise_idx
  on public.zoology_questions (section, exercise);
create index if not exists zoology_questions_difficulty_idx
  on public.zoology_questions (difficulty);
create index if not exists zoology_questions_source_pdf_idx
  on public.zoology_questions (source_pdf);
create index if not exists zoology_questions_question_en_trgm_idx
  on public.zoology_questions using gin (question_en gin_trgm_ops);
create index if not exists zoology_questions_question_hi_trgm_idx
  on public.zoology_questions using gin (question_hi gin_trgm_ops);
create index if not exists zoology_questions_question_code_trgm_idx
  on public.zoology_questions using gin (question_code gin_trgm_ops);

commit;
```<|end|><|start|>write to=assistant<|channel|>analysis<|message|>Created file successfully: zoology_questions.sql