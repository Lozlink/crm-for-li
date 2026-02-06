-- Fix: Team members can view teammate profiles
-- Without this, the memberships -> user_profiles join returns null for
-- other members because the SELECT policy only allows viewing own profile.

-- Helper: get all user IDs in the same teams as the given user
create or replace function get_team_member_ids(uid uuid)
returns setof uuid as $$
  select distinct m2.user_id
  from public.memberships m1
  join public.memberships m2 on m1.team_id = m2.team_id
  where m1.user_id = uid
    and m1.status = 'active'
    and m2.status = 'active';
$$ language sql stable security definer;

-- Allow team members to view profiles of their teammates
create policy "Team members can view teammate profiles" on user_profiles
  for select using (
    id in (select get_team_member_ids(auth.uid()))
  );

-- Fix: Use fully qualified public.user_profiles in handle_new_user
-- GoTrue's search_path may not include 'public', causing the insert to fail
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.user_profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.email));
  return new;
end;
$$ language plpgsql security definer;
