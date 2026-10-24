-- Additive image metadata support for remote question banks.
-- Apply this migration in every registered Supabase project. It does not
-- modify existing question text, options, answers, or hierarchy.

alter table if exists public.physics_questions
  add column if not exists images jsonb;

alter table if exists public.biology_questions
  add column if not exists images jsonb;

alter table if exists public.botany_questions
  add column if not exists images jsonb;

alter table if exists public.zoology_questions
  add column if not exists images jsonb;

alter table if exists public.chemistry_questions
  add column if not exists images jsonb;

alter table if exists public.pyq_questions
  add column if not exists images jsonb;

alter table if exists public.question_bank
  add column if not exists images jsonb;

alter table if exists public.question_bank_archive
  add column if not exists images jsonb;

-- Persistent storage for embedded images. The bucket is public-read so CBT and
-- admin previews can render persisted references without exposing service keys.
insert into storage.buckets (id, name, public)
values ('question-bank-images', 'question-bank-images', true)
on conflict (id) do update set public = excluded.public;
