-- Run this once in Supabase -> SQL Editor -> New query -> Run.
-- Safe to run more than once.
--
-- Lets a signed-in user permanently delete THEIR OWN account and all their data from inside the app.
-- Apple requires this for any app that lets people create an account (App Store guideline 5.1.1(v)),
-- and it's good practice everywhere. The browser can't delete an auth user directly with the public key,
-- so this small server-side function does it — and it only ever touches the caller's own account
-- (auth.uid() comes from their login, it can't be passed in or spoofed).
create or replace function delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;

  -- Don't let the last admin lock everyone out by accident.
  if exists (select 1 from profiles where id = uid and is_super_admin) then
    raise exception 'Super-admin accounts cannot be deleted from the app — hand over admin first.';
  end if;

  -- Athletes linked to a deleted coach keep their own accounts; they just lose the link.
  update profiles set coach_id = null where coach_id = uid;

  -- Explicit deletes (rather than relying on cascade settings) so nothing is left behind.
  delete from coach_feedback where athlete_id = uid or coach_id = uid;
  delete from coach_meal_plans where athlete_id = uid or coach_id = uid;
  delete from athlete_data where user_id = uid;
  delete from profiles where id = uid;

  -- Finally remove the login itself.
  delete from auth.users where id = uid;
end;
$$;

-- Only signed-in users may call it (never anonymous visitors).
revoke all on function delete_my_account() from public;
revoke all on function delete_my_account() from anon;
grant execute on function delete_my_account() to authenticated;
