-- Account-based admin panel for OINKIE Study.
--
-- Security model:
--   * admin_users is the allowlist of Supabase auth user UUIDs.
--   * Clients cannot read or write admin_users directly.
--   * public.is_admin() is the only allowlist check used by RLS.
--   * Content tables are read-only for students (active rows only) and
--     writable only by authenticated users for whom is_admin() is true.
--
-- ADMIN ENROLLMENT (run separately after this migration, with your own UUID):
--   insert into public.admin_users (user_id)
--   values ('<your-supabase-auth-user-uuid>')
--   on conflict (user_id) do nothing;
--
-- Do not put the admin UUID, a service-role key, or any other secret in a
-- VITE_* environment variable or in frontend code.

create table public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default pg_catalog.now()
);

alter table public.admin_users enable row level security;

-- No client grants or policies: the allowlist can only be managed through the
-- Supabase SQL editor, a migration, or another server-side trusted path.
revoke all on table public.admin_users from public, anon, authenticated;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
  );
$function$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Shared content timestamp trigger.
create function public.set_dashboard_content_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$function$;

revoke all on function public.set_dashboard_content_updated_at()
  from public, anon, authenticated;

create table public.dashboard_quick_actions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (pg_catalog.btrim(title) <> ''),
  description text not null default '',
  action_key text not null check (
    action_key in (
      'pyq-tests',
      'simulator',
      'import-paper',
      'mock-test',
      'custom-test',
      'question-bank',
      'performance',
      'revision',
      'quick-revision',
      'weak-topics',
      'syllabus',
      'streaks',
      'bookmarks',
      'notes',
      'flashcards',
      'study-plan',
      'history',
      'saved-papers',
      'settings',
      'search'
    )
  ),
  sort_order integer not null default 0 check (sort_order >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table public.dashboard_notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null check (pg_catalog.btrim(title) <> ''),
  message text not null check (pg_catalog.btrim(message) <> ''),
  sort_order integer not null default 0 check (sort_order >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table public.dashboard_quick_links (
  id uuid primary key default gen_random_uuid(),
  title text not null check (pg_catalog.btrim(title) <> ''),
  note text not null default '',
  target_type text not null check (target_type in ('action', 'url')),
  action_key text check (
    action_key is null or action_key in (
      'pyq-tests',
      'simulator',
      'import-paper',
      'mock-test',
      'custom-test',
      'question-bank',
      'performance',
      'revision',
      'quick-revision',
      'weak-topics',
      'syllabus',
      'streaks',
      'bookmarks',
      'notes',
      'flashcards',
      'study-plan',
      'history',
      'saved-papers',
      'settings',
      'search'
    )
  ),
  url text check (url is null or url ~ '^https?://'),
  sort_order integer not null default 0 check (sort_order >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  check (
    (target_type = 'action' and action_key is not null and url is null)
    or
    (target_type = 'url' and action_key is null and url is not null)
  )
);

create table public.neet_youtube_resources (
  id uuid primary key default gen_random_uuid(),
  title text not null check (pg_catalog.btrim(title) <> ''),
  creator text not null check (pg_catalog.btrim(creator) <> ''),
  url text not null check (url ~ '^https://(www\.|m\.)?(youtube\.com|youtu\.be)/'),
  thumbnail_url text check (
    thumbnail_url is null or thumbnail_url ~ '^https?://'
  ),
  sort_order integer not null default 0 check (sort_order >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create trigger dashboard_quick_actions_prepare_updated_at
before update on public.dashboard_quick_actions
for each row
execute function public.set_dashboard_content_updated_at();

create trigger dashboard_notifications_prepare_updated_at
before update on public.dashboard_notifications
for each row
execute function public.set_dashboard_content_updated_at();

create trigger dashboard_quick_links_prepare_updated_at
before update on public.dashboard_quick_links
for each row
execute function public.set_dashboard_content_updated_at();

create trigger neet_youtube_resources_prepare_updated_at
before update on public.neet_youtube_resources
for each row
execute function public.set_dashboard_content_updated_at();

alter table public.dashboard_quick_actions enable row level security;
alter table public.dashboard_notifications enable row level security;
alter table public.dashboard_quick_links enable row level security;
alter table public.neet_youtube_resources enable row level security;

revoke all on table public.dashboard_quick_actions from public, anon, authenticated;
revoke all on table public.dashboard_notifications from public, anon, authenticated;
revoke all on table public.dashboard_quick_links from public, anon, authenticated;
revoke all on table public.neet_youtube_resources from public, anon, authenticated;

grant select on table public.dashboard_quick_actions to authenticated;
grant select on table public.dashboard_notifications to authenticated;
grant select on table public.dashboard_quick_links to authenticated;
grant select on table public.neet_youtube_resources to authenticated;

grant insert, update, delete on table public.dashboard_quick_actions to authenticated;
grant insert, update, delete on table public.dashboard_notifications to authenticated;
grant insert, update, delete on table public.dashboard_quick_links to authenticated;
grant insert, update, delete on table public.neet_youtube_resources to authenticated;

create policy "Students read active quick actions"
on public.dashboard_quick_actions
for select
to authenticated
using (is_active);

create policy "Admins read all quick actions"
on public.dashboard_quick_actions
for select
to authenticated
using (public.is_admin());

create policy "Admins insert quick actions"
on public.dashboard_quick_actions
for insert
to authenticated
with check (public.is_admin());

create policy "Admins update quick actions"
on public.dashboard_quick_actions
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins delete quick actions"
on public.dashboard_quick_actions
for delete
to authenticated
using (public.is_admin());

create policy "Students read active notifications"
on public.dashboard_notifications
for select
to authenticated
using (is_active);

create policy "Admins read all notifications"
on public.dashboard_notifications
for select
to authenticated
using (public.is_admin());

create policy "Admins insert notifications"
on public.dashboard_notifications
for insert
to authenticated
with check (public.is_admin());

create policy "Admins update notifications"
on public.dashboard_notifications
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins delete notifications"
on public.dashboard_notifications
for delete
to authenticated
using (public.is_admin());

create policy "Students read active quick links"
on public.dashboard_quick_links
for select
to authenticated
using (is_active);

create policy "Admins read all quick links"
on public.dashboard_quick_links
for select
to authenticated
using (public.is_admin());

create policy "Admins insert quick links"
on public.dashboard_quick_links
for insert
to authenticated
with check (public.is_admin());

create policy "Admins update quick links"
on public.dashboard_quick_links
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins delete quick links"
on public.dashboard_quick_links
for delete
to authenticated
using (public.is_admin());

create policy "Students read active YouTube resources"
on public.neet_youtube_resources
for select
to authenticated
using (is_active);

create policy "Admins read all YouTube resources"
on public.neet_youtube_resources
for select
to authenticated
using (public.is_admin());

create policy "Admins insert YouTube resources"
on public.neet_youtube_resources
for insert
to authenticated
with check (public.is_admin());

create policy "Admins update YouTube resources"
on public.neet_youtube_resources
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins delete YouTube resources"
on public.neet_youtube_resources
for delete
to authenticated
using (public.is_admin());

create index dashboard_quick_actions_order_idx
  on public.dashboard_quick_actions (is_active, sort_order);
create index dashboard_notifications_order_idx
  on public.dashboard_notifications (is_active, sort_order);
create index dashboard_quick_links_order_idx
  on public.dashboard_quick_links (is_active, sort_order);
create index neet_youtube_resources_order_idx
  on public.neet_youtube_resources (is_active, sort_order);

-- Preserve the current dashboard defaults in the managed tables. These rows
-- are inserted only when the table is empty, so applying or manually re-running
-- this seed block later cannot overwrite content that has already been edited.
insert into public.dashboard_quick_actions
  (title, description, action_key, sort_order, is_active)
select seed.title, seed.description, seed.action_key, seed.sort_order, seed.is_active
from (values
  ('NEET PYQ Tests', 'Browse available NEET previous-year papers and start a CBT practice test.', 'pyq-tests', 10, true),
  ('Import Paper', 'Practice with a question paper PDF you have.', 'import-paper', 20, true),
  ('Custom Test', 'Build a timed, topic-filtered test from an imported question bank.', 'custom-test', 30, true),
  ('Question Bank', 'Import, search, preview and reuse local question banks.', 'question-bank', 40, true)
) as seed(title, description, action_key, sort_order, is_active)
where not exists (select 1 from public.dashboard_quick_actions);

insert into public.dashboard_quick_links
  (title, note, target_type, action_key, url, sort_order, is_active)
select seed.title, seed.note, seed.target_type, seed.action_key, seed.url, seed.sort_order, seed.is_active
from (values
  ('Test History', 'Review completed attempts', 'action', 'history', null, 10, true),
  ('Performance Analytics', 'See verified answer-key results', 'action', 'performance', null, 20, true),
  ('Revision Center', 'Review marked and incorrect questions', 'action', 'revision', null, 30, true),
  ('Bookmarks', 'Revisit questions saved from your banks', 'action', 'bookmarks', null, 40, true),
  ('Study Plan', 'Manage your locally saved tasks', 'action', 'study-plan', null, 50, true),
  ('Saved Papers', 'View reports linked to imported PDF papers', 'action', 'saved-papers', null, 60, true)
) as seed(title, note, target_type, action_key, url, sort_order, is_active)
where not exists (select 1 from public.dashboard_quick_links);
