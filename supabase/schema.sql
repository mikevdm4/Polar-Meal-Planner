-- Run this in your Supabase project's SQL editor (Supabase dashboard -> SQL Editor -> New query).
--
-- This replaces the old anonymous sync-code approach with real accounts:
-- every user (athlete or coach) gets a row in `profiles`, and each athlete's
-- app data lives in `athlete_data`, keyed to their real account.

-- One row per signed-up user (both athletes and coaches).
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  role text not null default 'athlete' check (role in ('athlete', 'coach')),
  coach_id uuid references profiles(id) on delete set null,
  display_name text,
  approved boolean not null default true,
  is_super_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- If you're updating an existing database rather than starting fresh,
-- these two lines add the new columns without touching existing rows
-- (safe to run even if the columns already exist).
alter table profiles add column if not exists approved boolean not null default true;
alter table profiles add column if not exists is_super_admin boolean not null default false;

-- One row per athlete, holding their full app data as a JSON blob
-- (same shape as before: profile, cart, logs, order history, etc).
create table if not exists athlete_data (
  user_id uuid primary key references profiles(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;
alter table athlete_data enable row level security;

-- Everyone can read and update their own profile.
create policy "read own profile" on profiles
  for select using (auth.uid() = id);

create policy "update own profile" on profiles
  for update using (auth.uid() = id);

-- SECURITY: the policy above only checks "is this your own row" — it does
-- NOT stop you from changing which columns get updated. Without anything
-- more, any signed-in user could set their own role/approved/is_super_admin
-- straight to coach-approved-admin via a direct API call, completely
-- bypassing the approval flow built into the app. Postgres RLS can't
-- restrict individual columns on its own, so a trigger enforces it instead:
-- ordinary users can update their own coach_id, display_name, etc. freely
-- (that's the coach-linking feature), but role/approved/is_super_admin are
-- silently locked to their existing value unless the person making the
-- change is already a super-admin.
create or replace function prevent_self_privilege_escalation()
returns trigger as $$
begin
  if not exists (
    select 1 from profiles me where me.id = auth.uid() and me.is_super_admin = true
  ) then
    new.role := old.role;
    new.approved := old.approved;
    new.is_super_admin := old.is_super_admin;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists lock_privileged_fields on profiles;
create trigger lock_privileged_fields
  before update on profiles
  for each row execute function prevent_self_privilege_escalation();

-- Anyone can insert their own profile row once (needed at sign-up time).
create policy "insert own profile" on profiles
  for insert with check (auth.uid() = id);

-- A coach can see the profiles of athletes linked to them.
create policy "coach reads own athletes" on profiles
  for select using (coach_id = auth.uid());

-- Any signed-in user needs to be able to look up a coach's account by email
-- in order to link to them (Setup -> Coach -> enter their email) — without
-- this, that lookup silently returns nothing even when the coach's row
-- exists, because no other policy permits seeing someone else's row. This
-- only exposes coach rows, never other athletes' rows, so it doesn't weaken
-- athlete privacy.
create policy "anyone can look up coach accounts" on profiles
  for select using (role = 'coach');

-- Super admins (you) can see and approve every profile.
create policy "super admin reads all profiles" on profiles
  for select using (
    exists (select 1 from profiles me where me.id = auth.uid() and me.is_super_admin = true)
  );

create policy "super admin updates all profiles" on profiles
  for update using (
    exists (select 1 from profiles me where me.id = auth.uid() and me.is_super_admin = true)
  );

-- Athletes can read and write their own data.
create policy "athlete reads own data" on athlete_data
  for select using (auth.uid() = user_id);

create policy "athlete inserts own data" on athlete_data
  for insert with check (auth.uid() = user_id);

create policy "athlete updates own data" on athlete_data
  for update using (auth.uid() = user_id);

-- A coach can read (but not write) the data of any athlete linked to them.
create policy "coach reads athlete data" on athlete_data
  for select using (
    exists (
      select 1 from profiles pr
      where pr.id = athlete_data.user_id
      and pr.coach_id = auth.uid()
    )
  );
