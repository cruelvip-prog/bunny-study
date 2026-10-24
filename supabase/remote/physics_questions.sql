-- OINKIE Study — Physics project SQL migration.
--
-- Target Supabase project:
--   Browser reader: VITE_SUPABASE_PHYSICS_URL /
--                   VITE_SUPABASE_PHYSICS_PUBLISHABLE_KEY
--   Trusted server: OINKIE_PHYSICS_SUPABASE_URL /
--                   OINKIE_PHYSICS_SUPABASE_SERVICE_ROLE_KEY
--
-- Target table: public.physics_questions
--
-- This is a create-or-upgrade migration. It creates the table when it is
-- missing and adds missing columns/constraints to an existing table. It never
-- drops a table, truncates rows, deletes rows, or rewrites an existing ID.
-- Review it in the Physics project's Supabase SQL editor before running it.
-- The script is transactional: if any step fails, PostgreSQL rolls it back.
--
-- Physics is a single-subject bank. There is no subject or subject_area column:
-- the registered source/table identifies the bank, and the public reader forces
-- the subject to Physics.
--
-- The admin importer writes these columns:
--   question_code, chapter, topic, section, exercise, question_en, question_hi,
--   options, answer_key, answer_key_source, explanation_en, explanation_hi,
--   difficulty, source_pdf, source_page, tags.
-- The database owns id, created_at, and updated_at for a newly created table.
-- If the table already exists, its current id type and existing IDs are
-- preserved; this migration never changes an id type or rewrites an id value.
-- A missing id default is filled for UUID and text/varchar columns. An
-- identity or sequence-backed integer/numeric id is supported when its
-- sequence is verified; otherwise the migration fails fast instead of
-- fabricating IDs. Unsupported id types also fail fast. The Physics registry
-- accepts opaque IDs, but admin create requires a server-generated id default.
--
-- Security model:
--   * Anonymous and ordinary authenticated users can SELECT rows (public reader).
--   * There is no INSERT/UPDATE/DELETE policy and no client write grant.
--   * The trusted admin server uses the project service-role key, which bypasses
--     RLS. The server verifies the main-project admin session before every write.

begin;

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- The options JSON contract contains exactly A, B, C, and D. Each option is an
-- object with text_en and/or text_hi. This is the object shape written by the
-- importer and rendered by the public reader.
create or replace function public.physics_options_are_valid(value jsonb)
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

revoke all on function public.physics_options_are_valid(jsonb)
  from public, anon, authenticated;
grant execute on function public.physics_options_are_valid(jsonb)
  to service_role;

create table if not exists public.physics_questions (
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
  constraint physics_questions_chapter_check check (
    chapter is not null and pg_catalog.btrim(chapter) <> ''
  ),
  constraint physics_questions_text_check check (
    pg_catalog.btrim(coalesce(question_en, '')) <> ''
    or pg_catalog.btrim(coalesce(question_hi, '')) <> ''
  ),
  constraint physics_questions_options_check check (
    public.physics_options_are_valid(options)
  ),
  constraint physics_questions_answer_key_check check (
    answer_key is null or answer_key in ('A', 'B', 'C', 'D')
  ),
  constraint physics_questions_source_page_check check (
    source_page is null or source_page > 0
  ),
  constraint physics_questions_tags_limit_check check (
    tags is not null and pg_catalog.cardinality(tags) <= 50
  )
);

-- Upgrade a table that predates this migration. Each clause is a no-op when
-- the column already exists. Defaults are supplied so a missing column cannot
-- leave existing rows without a usable value.
alter table public.physics_questions
  add column if not exists question_code text,
  add column if not exists chapter text,
  add column if not exists topic text,
  add column if not exists section text,
  add column if not exists exercise text,
  add column if not exists question_en text,
  add column if not exists question_hi text,
  add column if not exists options jsonb,
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

-- The table must already have an id column by this point. New tables get a UUID
-- primary key above; existing tables keep their id type and values. The checks
-- below intentionally fail fast for schemas this migration cannot safely
-- support, rather than fabricating or rewriting IDs.
do $id_compatibility$
declare
  id_type text;
  id_default text;
  id_sequence regclass;
  id_identity text;
  has_primary_key boolean;
  primary_key_on_id boolean;
begin
  select
    pg_catalog.format_type(attr.atttypid, attr.atttypmod),
    pg_catalog.pg_get_expr(default_value.adbin, default_value.adrelid),
    attr.attidentity::text
  into id_type, id_default, id_identity
  from pg_catalog.pg_attribute attr
  left join pg_catalog.pg_attrdef default_value
    on default_value.adrelid = attr.attrelid
   and default_value.adnum = attr.attnum
  where attr.attrelid = 'public.physics_questions'::regclass
    and attr.attname = 'id'
    and not attr.attisdropped;

  if id_type is null then
    raise exception
      'public.physics_questions has no id column; reconcile the existing table before applying this migration.';
  end if;

  select exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.physics_questions'::regclass
      and contype = 'p'
  ) into has_primary_key;

  if has_primary_key then
    select exists (
      select 1
      from pg_catalog.pg_constraint c
      where c.conrelid = 'public.physics_questions'::regclass
        and c.contype = 'p'
        and c.conkey = array[
          (
            select a.attnum
            from pg_catalog.pg_attribute a
            where a.attrelid = 'public.physics_questions'::regclass
              and a.attname = 'id'
              and not a.attisdropped
          )
        ]::int2[]
    ) into primary_key_on_id;

    if not primary_key_on_id then
      raise exception
        'public.physics_questions already has a primary key that is not solely on id. Reconcile the existing table before applying this migration; no IDs were changed.';
    end if;
  else
    if exists (
      select 1
      from public.physics_questions
      where id is null
    ) then
      raise exception
        'public.physics_questions.id contains NULL values. Reconcile the existing rows before applying this migration; no IDs were changed.';
    end if;

    if exists (
      select id
      from public.physics_questions
      group by id
      having count(*) > 1
    ) then
      raise exception
        'public.physics_questions.id contains duplicate values. Reconcile the existing rows before applying this migration; no IDs were changed.';
    end if;

    alter table public.physics_questions add primary key (id);
  end if;

  if id_type = 'uuid' then
    if id_default is null then
      alter table public.physics_questions
        alter column id set default gen_random_uuid();
    end if;
  elsif id_type = 'text'
     or id_type = 'character'
     or id_type = 'character varying'
     or (
       (id_type like 'character varying(%' or id_type like 'character(%')
       and COALESCE(substring(id_type from '\(([0-9]+)\)'), '0')::integer >= 36
     ) then
    if id_default is null then
      alter table public.physics_questions
        alter column id set default gen_random_uuid()::text;
    end if;
  elsif id_type in ('smallint', 'integer', 'bigint', 'numeric') then
    id_sequence := pg_catalog.pg_get_serial_sequence(
      'public.physics_questions',
      'id'
    );

    if id_sequence is null then
      raise exception
        'public.physics_questions.id is % and has no verified identity or sequence-backed default. This migration will not fabricate numeric IDs. Reconcile the table to use UUID/text IDs, an identity column, or an existing sequence-backed default before applying it.', id_type;
    end if;

    if id_identity in ('a', 'd') then
      -- Preserve an identity column exactly as defined, including ALWAYS or
      -- BY DEFAULT mode. Its NULL pg_attrdef entry is expected and is not a
      -- missing generator.
      null;
    elsif not exists (
      select 1
      from pg_catalog.pg_attrdef a
      join pg_catalog.pg_depend d
        on d.classid = 'pg_attrdef'::regclass
       and d.objid = a.oid
       and d.refclassid = 'pg_class'::regclass
       and d.refobjid = id_sequence
       and d.refobjsubid = 0
       and d.deptype = 'n'
      where a.adrelid = 'public.physics_questions'::regclass
        and a.adnum = (
              select attr.attnum
              from pg_catalog.pg_attribute attr
              where attr.attrelid = 'public.physics_questions'::regclass
                and attr.attname = 'id'
                and not attr.attisdropped
            )
        and a.adbin is not null
        and pg_catalog.pg_get_expr(a.adbin, a.adrelid) ilike 'nextval(%'
    ) then
      raise exception
        'public.physics_questions.id is % but its catalog dependency does not verify sequence % (found default: %). This migration preserves the existing default and will not fabricate numeric IDs. Reconcile the table before applying it.', id_type, id_sequence, COALESCE(id_default, '<null>');
    end if;

    -- The existing identity/default is preserved. Only the confirmed sequence
    -- receives the narrow privileges needed by service_role inserts.
    execute format(
      'grant usage, select on sequence %s to service_role',
      id_sequence
    );
  else
    raise exception
      'public.physics_questions.id has unsupported type %. This migration supports UUID, unbounded text/varchar, bounded character/varchar only when its length is at least 36, or an existing sequence-backed integer/numeric id whose default uses that sequence. Existing id values are preserved; no type conversion was performed.', id_type;
  end if;

  if id_type <> 'uuid' then
    raise notice
      'Existing public.physics_questions.id type is %. Existing IDs are preserved; new tables use UUID ids.', id_type;
  end if;
end;
$id_compatibility$;

-- Fail fast when an existing timestamp column uses date. A date column cannot
-- receive the timestamp default used by this migration, and this migration does
-- not alter column types or rewrite existing data.
do $timestamp_column_type$
begin
  if exists (
    select 1
    from pg_catalog.pg_attribute attr
    where attr.attrelid = 'public.physics_questions'::regclass
      and not attr.attisdropped
      and attr.attname in ('created_at', 'updated_at')
      and attr.atttypid = 'date'::regtype
  ) then
    raise exception
      'public.physics_questions has a date-typed created_at or updated_at column. Reconcile it to timestamp or timestamptz manually before applying this migration; no column types or data were changed.';
  end if;
end;
$timestamp_column_type$;

-- Fail fast when an existing column uses a type that the importer and reader do
-- not expect. This migration never converts an existing column type.
do $column_type_compatibility$
declare
  incompatible_columns text;
begin
  select pg_catalog.string_agg(
    pg_catalog.format('%I is %s', attr.attname, pg_catalog.format_type(attr.atttypid, attr.atttypmod)),
    ', '
    order by attr.attname
  )
  into incompatible_columns
  from pg_catalog.pg_attribute attr
  where attr.attrelid = 'public.physics_questions'::regclass
    and not attr.attisdropped
    and attr.attname in (
      'chapter', 'question_code', 'topic', 'section', 'exercise',
      'question_en', 'question_hi', 'options', 'answer_key',
      'answer_key_source', 'explanation_en', 'explanation_hi',
      'difficulty', 'source_pdf', 'source_page', 'tags',
      'created_at', 'updated_at'
    )
    and not (
      (
        attr.attname in (
          'chapter', 'question_code', 'topic', 'section', 'exercise',
          'question_en', 'question_hi', 'answer_key', 'answer_key_source',
          'explanation_en', 'explanation_hi', 'difficulty', 'source_pdf'
        )
        and pg_catalog.format_type(attr.atttypid, attr.atttypmod) in (
          'text', 'character varying', 'character'
        )
      )
      or (
        attr.attname = 'options'
        and pg_catalog.format_type(attr.atttypid, attr.atttypmod) = 'jsonb'
      )
      or (
        attr.attname = 'source_page'
        and pg_catalog.format_type(attr.atttypid, attr.atttypmod) in (
          'smallint', 'integer', 'bigint', 'numeric'
        )
      )
      or (
        attr.attname = 'tags'
        and pg_catalog.format_type(attr.atttypid, attr.atttypmod) = 'text[]'
      )
      or (
        attr.attname in ('created_at', 'updated_at')
        and pg_catalog.format_type(attr.atttypid, attr.atttypmod) in (
          'timestamp without time zone',
          'timestamp with time zone'
        )
      )
    );

  if incompatible_columns is not null then
    raise exception
      'public.physics_questions has incompatible existing column types: %. Reconcile the table or use a separate reviewed migration; this migration does not convert column types.', incompatible_columns;
  end if;
end;
$column_type_compatibility$;

-- Keep timestamp defaults on an upgraded table. Only timestamp-shaped columns
-- are touched, so an unexpected legacy column type causes no implicit cast.
do $timestamp_defaults$
begin
  if exists (
    select 1
    from pg_catalog.pg_attribute
    where attrelid = 'public.physics_questions'::regclass
      and attname = 'created_at'
      and not attisdropped
      and atttypid in ('timestamptz'::regtype, 'timestamp'::regtype)
  ) then
    alter table public.physics_questions
      alter column created_at set default pg_catalog.now();
  end if;

  if exists (
    select 1
    from pg_catalog.pg_attribute
    where attrelid = 'public.physics_questions'::regclass
      and attname = 'updated_at'
      and not attisdropped
      and atttypid in ('timestamptz'::regtype, 'timestamp'::regtype)
  ) then
    alter table public.physics_questions
      alter column updated_at set default pg_catalog.now();
  end if;
end;
$timestamp_defaults$;

comment on table public.physics_questions is
  'OINKIE Physics question bank. Public read-only; admin writes only through the trusted OINKIE server after main-project is_admin() verification.';
comment on column public.physics_questions.options is
  'JSON object with exactly A, B, C, D. Each value is { "text_en": string, "text_hi": string|null }.';
comment on column public.physics_questions.id is
  'UUID for a newly created table. An already-existing table keeps its current id type and IDs. Numeric IDs are supported for identity columns or when an existing sequence-backed default is present; otherwise this migration fails fast and does not fabricate IDs.';

-- Preflight existing rows before adding constraints. This migration does not
-- rewrite, delete, or fabricate question data, so incompatible rows must be
-- reconciled first.
do $data_preflight$
begin
  if exists (
    select 1
    from public.physics_questions
    where chapter is null or pg_catalog.btrim(chapter) = ''
  ) then
    raise exception
      'Existing public.physics_questions rows have a NULL or blank chapter. Reconcile those rows before applying this migration; no data was changed.';
  end if;

  if exists (
    select 1
    from public.physics_questions
    where pg_catalog.btrim(COALESCE(question_en, '')) = ''
      and pg_catalog.btrim(COALESCE(question_hi, '')) = ''
  ) then
    raise exception
      'Existing public.physics_questions rows have neither English nor Hindi question text. Reconcile those rows before applying this migration; no data was changed.';
  end if;

  if exists (
    select 1
    from public.physics_questions
    where not public.physics_options_are_valid(options)
  ) then
    raise exception
      'Existing public.physics_questions rows have invalid options. Options must be a JSON object with exactly A, B, C, and D, and each option must contain English or Hindi text. Reconcile those rows before applying this migration; no data was changed.';
  end if;

  if exists (
    select 1
    from public.physics_questions
    where answer_key is not null
      and answer_key not in ('A', 'B', 'C', 'D')
  ) then
    raise exception
      'Existing public.physics_questions rows have an answer_key outside A, B, C, D, or NULL. Reconcile those rows before applying this migration; no data was changed.';
  end if;

  if exists (
    select 1
    from public.physics_questions
    where source_page is not null
      and source_page <= 0
  ) then
    raise exception
      'Existing public.physics_questions rows have a source_page that is not positive. Reconcile those rows before applying this migration; no data was changed.';
  end if;

  if exists (
    select 1
    from public.physics_questions
    where tags is null
      or pg_catalog.cardinality(tags) > 50
  ) then
    raise exception
      'Existing public.physics_questions rows have NULL tags or more than 50 tags. Reconcile those rows before applying this migration; no data was changed.';
  end if;
end;
$data_preflight$;

-- Add checks when upgrading a table that was created before these constraints
-- existed. Constraints created with the table above are skipped.
do $constraints$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.physics_questions'::regclass
      and conname = 'physics_questions_chapter_check'
  ) then
    alter table public.physics_questions
      add constraint physics_questions_chapter_check check (
        chapter is not null and pg_catalog.btrim(chapter) <> ''
      );
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.physics_questions'::regclass
      and conname = 'physics_questions_text_check'
  ) then
    alter table public.physics_questions
      add constraint physics_questions_text_check check (
        pg_catalog.btrim(coalesce(question_en, '')) <> ''
        or pg_catalog.btrim(coalesce(question_hi, '')) <> ''
      );
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.physics_questions'::regclass
      and conname = 'physics_questions_options_check'
  ) then
    alter table public.physics_questions
      add constraint physics_questions_options_check check (
        public.physics_options_are_valid(options)
      );
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.physics_questions'::regclass
      and conname = 'physics_questions_answer_key_check'
  ) then
    alter table public.physics_questions
      add constraint physics_questions_answer_key_check check (
        answer_key is null or answer_key in ('A', 'B', 'C', 'D')
      );
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.physics_questions'::regclass
      and conname = 'physics_questions_source_page_check'
  ) then
    alter table public.physics_questions
      add constraint physics_questions_source_page_check check (
        source_page is null or source_page > 0
      );
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.physics_questions'::regclass
      and conname = 'physics_questions_tags_limit_check'
  ) then
    alter table public.physics_questions
      add constraint physics_questions_tags_limit_check check (
        tags is not null and pg_catalog.cardinality(tags) <= 50
      );
  end if;
end;
$constraints$;

create or replace function public.set_physics_questions_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$function$;

revoke all on function public.set_physics_questions_updated_at()
  from public, anon, authenticated;
grant execute on function public.set_physics_questions_updated_at()
  to service_role;

-- Replacing this named trigger/function updates updated_at handling for this
-- table. It does not rewrite rows, but it replaces any prior object using these
-- names.
drop trigger if exists physics_questions_prepare_updated_at
  on public.physics_questions;
create trigger physics_questions_prepare_updated_at
  before update on public.physics_questions
  for each row execute function public.set_physics_questions_updated_at();

alter table public.physics_questions enable row level security;

revoke all on table public.physics_questions from public, anon, authenticated;
grant select on table public.physics_questions to anon, authenticated;
grant all on table public.physics_questions to service_role;
-- Sequence privileges are granted only inside id_compatibility, and only for
-- the sequence returned by pg_get_serial_sequence for public.physics_questions.id.

-- Preserve an existing public-read policy, such as "Students can read physics
-- questions". Only create the migration's named policy when no SELECT policy
-- already grants read access to anon or authenticated.
do $public_read_policy$
begin
  if not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'physics_questions'
      and cmd = 'SELECT'
      and roles && array['anon'::name, 'authenticated'::name]
  ) then
    create policy "OINKIE physics public read"
      on public.physics_questions
      for select
      to anon, authenticated
      using (true);
  end if;
end;
$public_read_policy$;

-- No INSERT, UPDATE, or DELETE policies are created. Client roles have no write grants.

create index if not exists physics_questions_chapter_topic_idx
  on public.physics_questions (chapter, topic);
create index if not exists physics_questions_section_exercise_idx
  on public.physics_questions (section, exercise);
create index if not exists physics_questions_difficulty_idx
  on public.physics_questions (difficulty);
create index if not exists physics_questions_source_pdf_idx
  on public.physics_questions (source_pdf);
create index if not exists physics_questions_question_en_trgm_idx
  on public.physics_questions using gin (question_en gin_trgm_ops);
create index if not exists physics_questions_question_hi_trgm_idx
  on public.physics_questions using gin (question_hi gin_trgm_ops);
create index if not exists physics_questions_question_code_trgm_idx
  on public.physics_questions using gin (question_code gin_trgm_ops);

commit;
