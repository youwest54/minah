-- Minah — baby tracker schema.
-- Paste this whole file into the Supabase dashboard SQL editor and run it once.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- tables

create table if not exists public.households (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default 'Home',
  baby_name  text not null default 'Baby',
  join_code  text not null unique,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table if not exists public.events (
  id           uuid primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  type         text not null check (type in ('feed', 'sleep', 'diaper', 'note')),
  started_at   timestamptz not null,
  ended_at     timestamptz,
  details      jsonb not null default '{}'::jsonb,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  -- Set by the phone that made the edit: the newer value wins when two phones
  -- change the same entry while one of them was offline.
  updated_at   timestamptz not null default now(),
  -- Soft delete, so a deletion made offline still reaches the other phone.
  deleted      boolean not null default false
);

create index if not exists events_household_started_idx
  on public.events (household_id, started_at desc);

-- ---------------------------------------------------- membership helper

-- security definer so the policies below can read memberships without
-- recursively triggering the policy on household_members.
create or replace function public.is_household_member(p_household uuid)
  returns boolean
  language sql
  security definer
  stable
  set search_path = public
as $$
  select exists (
    select 1
    from public.household_members m
    where m.household_id = p_household
      and m.user_id = auth.uid()
  );
$$;

-- ------------------------------------------------- row level security

alter table public.households        enable row level security;
alter table public.household_members enable row level security;
alter table public.events            enable row level security;

drop policy if exists households_select on public.households;
create policy households_select on public.households
  for select to authenticated
  using (public.is_household_member(id));

drop policy if exists households_update on public.households;
create policy households_update on public.households
  for update to authenticated
  using (public.is_household_member(id))
  with check (public.is_household_member(id));

drop policy if exists members_select on public.household_members;
create policy members_select on public.household_members
  for select to authenticated
  using (public.is_household_member(household_id));

drop policy if exists events_select on public.events;
create policy events_select on public.events
  for select to authenticated
  using (public.is_household_member(household_id));

drop policy if exists events_insert on public.events;
create policy events_insert on public.events
  for insert to authenticated
  with check (public.is_household_member(household_id));

drop policy if exists events_update on public.events;
create policy events_update on public.events
  for update to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- Deliberately no delete policy: the app only ever soft-deletes.

-- ----------------------------------------------------------- functions

create or replace function public.generate_join_code()
  returns text
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  -- No 0/O/1/I/L, so a code read aloud over the phone can't be mistyped.
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  candidate text;
begin
  loop
    candidate := '';
    for i in 1 .. 6 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.households where join_code = candidate);
  end loop;
  return candidate;
end;
$$;

create or replace function public.create_household(p_baby_name text)
  returns public.households
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  result public.households;
begin
  if auth.uid() is null then
    raise exception 'NOT_SIGNED_IN';
  end if;

  insert into public.households (baby_name, join_code, created_by)
  values (
    coalesce(nullif(trim(p_baby_name), ''), 'Baby'),
    public.generate_join_code(),
    auth.uid()
  )
  returning * into result;

  insert into public.household_members (household_id, user_id)
  values (result.id, auth.uid());

  return result;
end;
$$;

create or replace function public.join_household(p_code text)
  returns public.households
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  result public.households;
begin
  if auth.uid() is null then
    raise exception 'NOT_SIGNED_IN';
  end if;

  select * into result
  from public.households
  where join_code = upper(trim(p_code));

  if result.id is null then
    raise exception 'INVALID_CODE';
  end if;

  insert into public.household_members (household_id, user_id)
  values (result.id, auth.uid())
  on conflict (household_id, user_id) do nothing;

  return result;
end;
$$;

revoke all on function public.generate_join_code() from public;
grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.create_household(text) to authenticated;
grant execute on function public.join_household(text) to authenticated;

-- --------------------------------------------------------- realtime

-- Lets the other parent's phone update instantly instead of on next refresh.
alter table public.events replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.events;
exception
  when duplicate_object then null;
end;
$$;
