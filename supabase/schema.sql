-- Run this in the Supabase SQL editor.
-- This schema is designed for user-scoped, health-aware data with RLS.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  name text not null default 'New User',
  age integer,
  gender text,
  allergies text[] not null default '{}',
  conditions text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_age_check check (age is null or (age >= 0 and age <= 130))
);

create table if not exists public.medicines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  dose text not null,
  timing text not null,
  duration text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  medicine_id uuid not null references public.medicines(id) on delete cascade,
  status text not null check (status in ('taken', 'missed')),
  taken_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.ai_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  query text not null,
  response text not null,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  derived_name text;
  derived_email text;
begin
  derived_email := coalesce(
    nullif(trim(coalesce(new.email, '')), ''),
    new.id::text || '@unknown.local'
  );

  derived_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(derived_email, '@', 1), ''),
    'New User'
  );

  insert into public.profiles (
    id,
    email,
    name,
    age,
    gender,
    allergies,
    conditions
  )
  values (
    new.id,
    derived_email,
    derived_name,
    null,
    null,
    '{}',
    '{}'
  )
  on conflict (id) do update
  set
    email = excluded.email,
    name = case
      when public.profiles.name is null or trim(public.profiles.name) = '' then excluded.name
      else public.profiles.name
    end,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists set_medicines_updated_at on public.medicines;
create trigger set_medicines_updated_at
before update on public.medicines
for each row
execute function public.set_updated_at();

create index if not exists idx_medicines_user_id on public.medicines(user_id);
create index if not exists idx_logs_user_id on public.logs(user_id);
create index if not exists idx_logs_medicine_id on public.logs(medicine_id);
create index if not exists idx_logs_taken_at on public.logs(taken_at desc);
create index if not exists idx_ai_history_user_id on public.ai_history(user_id);

alter table public.profiles enable row level security;
alter table public.medicines enable row level security;
alter table public.logs enable row level security;
alter table public.ai_history enable row level security;

drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists profiles_delete_own on public.profiles;

create policy profiles_select_own
on public.profiles
for select
using (auth.uid() = id);

create policy profiles_insert_own
on public.profiles
for insert
with check (auth.uid() = id);

create policy profiles_update_own
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

create policy profiles_delete_own
on public.profiles
for delete
using (auth.uid() = id);

drop policy if exists medicines_select_own on public.medicines;
drop policy if exists medicines_insert_own on public.medicines;
drop policy if exists medicines_update_own on public.medicines;
drop policy if exists medicines_delete_own on public.medicines;

create policy medicines_select_own
on public.medicines
for select
using (auth.uid() = user_id);

create policy medicines_insert_own
on public.medicines
for insert
with check (auth.uid() = user_id);

create policy medicines_update_own
on public.medicines
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy medicines_delete_own
on public.medicines
for delete
using (auth.uid() = user_id);

drop policy if exists logs_select_own on public.logs;
drop policy if exists logs_insert_own on public.logs;
drop policy if exists logs_update_own on public.logs;
drop policy if exists logs_delete_own on public.logs;

create policy logs_select_own
on public.logs
for select
using (auth.uid() = user_id);

create policy logs_insert_own
on public.logs
for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.medicines
    where public.medicines.id = medicine_id
      and public.medicines.user_id = auth.uid()
  )
);

create policy logs_update_own
on public.logs
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy logs_delete_own
on public.logs
for delete
using (auth.uid() = user_id);

drop policy if exists ai_history_select_own on public.ai_history;
drop policy if exists ai_history_insert_own on public.ai_history;
drop policy if exists ai_history_update_own on public.ai_history;
drop policy if exists ai_history_delete_own on public.ai_history;

create policy ai_history_select_own
on public.ai_history
for select
using (auth.uid() = user_id);

create policy ai_history_insert_own
on public.ai_history
for insert
with check (auth.uid() = user_id);

create policy ai_history_update_own
on public.ai_history
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy ai_history_delete_own
on public.ai_history
for delete
using (auth.uid() = user_id);
