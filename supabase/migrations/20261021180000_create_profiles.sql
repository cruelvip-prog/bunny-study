create table public.profiles (
  id uuid primary key default auth.uid()
    references auth.users (id) on delete cascade,
  full_name text not null
    check (
      pg_catalog.btrim(
        full_name,
        U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
      ) <> ''
    ),
  student_class text not null
    check (student_class in ('11th', '12th', 'dropper')),
  target_neet_year integer not null
    check (target_neet_year > 0),
  coaching_institute text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create function public.prepare_profile_row()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_current_utc_year integer :=
    pg_catalog.date_part(
      'year',
      pg_catalog.timezone('UTC', v_now)
    )::integer;
begin
  new.full_name := pg_catalog.btrim(
    new.full_name,
    U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
  );
  new.coaching_institute := nullif(
    pg_catalog.btrim(
      new.coaching_institute,
      U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
    ),
    ''
  );

  if new.target_neet_year < v_current_utc_year then
    raise exception 'target_neet_year must be the current or a future UTC calendar year'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id then
      raise exception 'profile id cannot be changed'
        using errcode = '23514';
    end if;

    new.created_at := old.created_at;
    new.updated_at := v_now;
  else
    new.created_at := v_now;
    new.updated_at := v_now;
  end if;

  return new;
end;
$function$;

revoke all on function public.prepare_profile_row()
  from PUBLIC, anon, authenticated;

create trigger profiles_prepare_row
before insert or update on public.profiles
for each row
execute function public.prepare_profile_row();

alter table public.profiles enable row level security;

revoke all on table public.profiles from PUBLIC, anon, authenticated;

grant select on table public.profiles to authenticated;

grant insert (
  full_name,
  student_class,
  target_neet_year,
  coaching_institute
) on table public.profiles to authenticated;

grant update (
  full_name,
  student_class,
  target_neet_year,
  coaching_institute
) on table public.profiles to authenticated;

create policy "Users can read their own profile"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

create policy "Users can create their own profile"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

create policy "Users can update their own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);
