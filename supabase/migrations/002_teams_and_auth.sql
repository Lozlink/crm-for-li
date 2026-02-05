-- Teams & Multi-User System Migration
-- Adds teams, memberships, invitations, user profiles, and team-scoped RLS

-- ============================================================
-- 1. New Tables
-- ============================================================

-- User profiles (extends auth.users with app-specific data)
create table if not exists user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  active_team_id uuid, -- FK added after teams table exists
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Teams (agencies)
create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  owner_id uuid references auth.users(id) on delete set null,
  avatar_url text,
  settings jsonb default '{}'::jsonb,
  plan text not null default 'free' check (plan in ('free', 'pro', 'team')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Now add the FK from user_profiles to teams
alter table user_profiles
  add constraint user_profiles_active_team_id_fkey
  foreign key (active_team_id) references teams(id) on delete set null;

-- Memberships (junction: users <-> teams)
create table if not exists memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member', 'viewer')),
  status text not null default 'active' check (status in ('active', 'invited', 'suspended')),
  invited_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, team_id)
);

-- Invitations (code-based + email invite flow)
create table if not exists invitations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  email text,
  invite_code text not null unique,
  role text not null default 'member' check (role in ('admin', 'member', 'viewer')),
  invited_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz default now()
);

-- Indexes
create index if not exists memberships_user_id_idx on memberships(user_id);
create index if not exists memberships_team_id_idx on memberships(team_id);
create index if not exists invitations_team_id_idx on invitations(team_id);
create index if not exists invitations_invite_code_idx on invitations(invite_code);
create index if not exists teams_slug_idx on teams(slug);

-- ============================================================
-- 2. Add team_id to existing tables
-- ============================================================

alter table contacts add column if not exists team_id uuid references teams(id) on delete cascade;
create index if not exists contacts_team_id_idx on contacts(team_id);

alter table tags add column if not exists team_id uuid references teams(id) on delete cascade;
create index if not exists tags_team_id_idx on tags(team_id);

alter table activities add column if not exists team_id uuid references teams(id) on delete cascade;
create index if not exists activities_team_id_idx on activities(team_id);

-- ============================================================
-- 3. Helper function for RLS
-- ============================================================

create or replace function get_user_team_ids(uid uuid)
returns setof uuid as $$
  select team_id from memberships where user_id = uid and status = 'active';
$$ language sql stable security definer;

-- ============================================================
-- 4. Drop old per-user RLS policies
-- ============================================================

-- Tags
drop policy if exists "Users can view their own tags" on tags;
drop policy if exists "Users can create their own tags" on tags;
drop policy if exists "Users can update their own tags" on tags;
drop policy if exists "Users can delete their own tags" on tags;

-- Contacts
drop policy if exists "Users can view their own contacts" on contacts;
drop policy if exists "Users can create their own contacts" on contacts;
drop policy if exists "Users can update their own contacts" on contacts;
drop policy if exists "Users can delete their own contacts" on contacts;

-- Activities
drop policy if exists "Users can view their own activities" on activities;
drop policy if exists "Users can create their own activities" on activities;
drop policy if exists "Users can update their own activities" on activities;
drop policy if exists "Users can delete their own activities" on activities;

-- ============================================================
-- 5. New team-scoped RLS policies
-- ============================================================

-- Tags policies
create policy "Team members can view tags" on tags
  for select using (
    team_id in (select get_user_team_ids(auth.uid()))
    or (team_id is null and user_id = auth.uid())
  );

create policy "Team members can create tags" on tags
  for insert with check (
    team_id in (select get_user_team_ids(auth.uid()))
  );

create policy "Team members can update tags" on tags
  for update using (
    team_id in (select get_user_team_ids(auth.uid()))
    or (team_id is null and user_id = auth.uid())
  );

create policy "Team members can delete tags" on tags
  for delete using (
    team_id in (select get_user_team_ids(auth.uid()))
    or (team_id is null and user_id = auth.uid())
  );

-- Contacts policies
create policy "Team members can view contacts" on contacts
  for select using (
    team_id in (select get_user_team_ids(auth.uid()))
    or (team_id is null and user_id = auth.uid())
  );

create policy "Team members can create contacts" on contacts
  for insert with check (
    team_id in (select get_user_team_ids(auth.uid()))
  );

create policy "Team members can update contacts" on contacts
  for update using (
    team_id in (select get_user_team_ids(auth.uid()))
    or (team_id is null and user_id = auth.uid())
  );

create policy "Team non-viewers can delete contacts" on contacts
  for delete using (
    team_id in (
      select team_id from memberships
      where user_id = auth.uid()
        and status = 'active'
        and role in ('owner', 'admin', 'member')
    )
  );

-- Activities policies
create policy "Team members can view activities" on activities
  for select using (
    team_id in (select get_user_team_ids(auth.uid()))
    or (team_id is null and user_id = auth.uid())
  );

create policy "Team members can create activities" on activities
  for insert with check (
    team_id in (select get_user_team_ids(auth.uid()))
  );

create policy "Team members can update activities" on activities
  for update using (
    team_id in (select get_user_team_ids(auth.uid()))
    or (team_id is null and user_id = auth.uid())
  );

create policy "Team non-viewers can delete activities" on activities
  for delete using (
    team_id in (
      select team_id from memberships
      where user_id = auth.uid()
        and status = 'active'
        and role in ('owner', 'admin', 'member')
    )
  );

-- ============================================================
-- 6. RLS on new tables
-- ============================================================

alter table user_profiles enable row level security;
alter table teams enable row level security;
alter table memberships enable row level security;
alter table invitations enable row level security;

-- User profiles: own row only
create policy "Users can view own profile" on user_profiles
  for select using (id = auth.uid());

create policy "Users can update own profile" on user_profiles
  for update using (id = auth.uid());

create policy "Users can insert own profile" on user_profiles
  for insert with check (id = auth.uid());

-- Teams: visible to members
create policy "Team members can view their teams" on teams
  for select using (
    id in (select get_user_team_ids(auth.uid()))
  );

create policy "Authenticated users can create teams" on teams
  for insert with check (auth.uid() is not null);

create policy "Team owners can update their team" on teams
  for update using (
    id in (
      select team_id from memberships
      where user_id = auth.uid()
        and status = 'active'
        and role in ('owner', 'admin')
    )
  );

create policy "Team owners can delete their team" on teams
  for delete using (
    id in (
      select team_id from memberships
      where user_id = auth.uid()
        and status = 'active'
        and role = 'owner'
    )
  );

-- Memberships: visible to team members
create policy "Team members can view memberships" on memberships
  for select using (
    team_id in (select get_user_team_ids(auth.uid()))
  );

create policy "Team admins can manage memberships" on memberships
  for insert with check (
    team_id in (
      select team_id from memberships m
      where m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('owner', 'admin')
    )
    or user_id = auth.uid() -- allow self-insert during team creation
  );

create policy "Team admins can update memberships" on memberships
  for update using (
    team_id in (
      select team_id from memberships m
      where m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('owner', 'admin')
    )
  );

create policy "Team admins can remove members" on memberships
  for delete using (
    team_id in (
      select team_id from memberships m
      where m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('owner', 'admin')
    )
    or user_id = auth.uid() -- allow self-removal (leave team)
  );

-- Invitations: visible to team admins+
create policy "Team admins can view invitations" on invitations
  for select using (
    team_id in (
      select team_id from memberships
      where user_id = auth.uid()
        and status = 'active'
        and role in ('owner', 'admin')
    )
  );

create policy "Team admins can create invitations" on invitations
  for insert with check (
    team_id in (
      select team_id from memberships
      where user_id = auth.uid()
        and status = 'active'
        and role in ('owner', 'admin')
    )
  );

create policy "Team admins can delete invitations" on invitations
  for delete using (
    team_id in (
      select team_id from memberships
      where user_id = auth.uid()
        and status = 'active'
        and role in ('owner', 'admin')
    )
  );

-- ============================================================
-- 7. Database function for invite acceptance
-- ============================================================

create or replace function accept_invitation(p_invite_code text)
returns jsonb as $$
declare
  v_invitation record;
  v_existing record;
  v_membership_id uuid;
begin
  -- Find the invitation
  select * into v_invitation
  from invitations
  where invite_code = p_invite_code
    and accepted_at is null
    and expires_at > now();

  if not found then
    return jsonb_build_object('success', false, 'error', 'Invalid or expired invitation');
  end if;

  -- Check if already a member
  select * into v_existing
  from memberships
  where user_id = auth.uid()
    and team_id = v_invitation.team_id;

  if found then
    return jsonb_build_object('success', false, 'error', 'Already a member of this team');
  end if;

  -- Create membership
  insert into memberships (user_id, team_id, role, status, invited_by, joined_at)
  values (auth.uid(), v_invitation.team_id, v_invitation.role, 'active', v_invitation.invited_by, now())
  returning id into v_membership_id;

  -- Mark invitation as accepted
  update invitations
  set accepted_at = now()
  where id = v_invitation.id;

  -- Set as active team if user has no active team
  update user_profiles
  set active_team_id = v_invitation.team_id
  where id = auth.uid()
    and active_team_id is null;

  return jsonb_build_object(
    'success', true,
    'membership_id', v_membership_id,
    'team_id', v_invitation.team_id
  );
end;
$$ language plpgsql security definer;

-- ============================================================
-- 8. Trigger for auto-profile creation on signup
-- ============================================================

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into user_profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.email));
  return new;
end;
$$ language plpgsql security definer;

-- Only create trigger if it doesn't exist
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'on_auth_user_created'
  ) then
    create trigger on_auth_user_created
      after insert on auth.users
      for each row
      execute function handle_new_user();
  end if;
end;
$$;

-- ============================================================
-- 9. Updated_at triggers for new tables
-- ============================================================

create trigger update_teams_updated_at
  before update on teams
  for each row
  execute function update_updated_at_column();

create trigger update_user_profiles_updated_at
  before update on user_profiles
  for each row
  execute function update_updated_at_column();

create trigger update_memberships_updated_at
  before update on memberships
  for each row
  execute function update_updated_at_column();
