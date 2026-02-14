-- Route Management Migration
-- Adds routes and route_stops tables with team-scoped RLS

-- ============================================================
-- 1. New Tables
-- ============================================================

create table if not exists routes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'planned' check (status in ('planned', 'in_progress', 'completed')),
  mode text not null default 'driving' check (mode in ('driving', 'walking')),
  estimated_duration_minutes int,
  polyline text,
  team_id uuid references teams(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists route_stops (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references routes(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  position int not null,
  address text,
  latitude float8 not null,
  longitude float8 not null,
  status text not null default 'pending' check (status in ('pending', 'visited', 'skipped')),
  estimated_arrival timestamptz,
  visited_at timestamptz,
  notes text,
  team_id uuid references teams(id) on delete cascade
);

-- Indexes
create index if not exists routes_team_id_idx on routes(team_id);
create index if not exists routes_user_id_idx on routes(user_id);
create index if not exists routes_status_idx on routes(status);
create index if not exists route_stops_route_id_idx on route_stops(route_id);
create index if not exists route_stops_contact_id_idx on route_stops(contact_id);
create index if not exists route_stops_team_id_idx on route_stops(team_id);

-- ============================================================
-- 2. Enable RLS
-- ============================================================

alter table routes enable row level security;
alter table route_stops enable row level security;

-- ============================================================
-- 3. RLS Policies - Routes
-- ============================================================

create policy "Team members can view routes" on routes
  for select using (
    team_id in (select get_user_team_ids(auth.uid()))
  );

create policy "Team members can create routes" on routes
  for insert with check (
    team_id in (select get_user_team_ids(auth.uid()))
  );

create policy "Team members can update routes" on routes
  for update using (
    team_id in (select get_user_team_ids(auth.uid()))
  );

create policy "Team non-viewers can delete routes" on routes
  for delete using (
    team_id in (
      select team_id from memberships
      where user_id = auth.uid()
        and status = 'active'
        and role in ('owner', 'admin', 'member')
    )
  );

-- ============================================================
-- 4. RLS Policies - Route Stops
-- ============================================================

create policy "Team members can view route_stops" on route_stops
  for select using (
    team_id in (select get_user_team_ids(auth.uid()))
  );

create policy "Team members can create route_stops" on route_stops
  for insert with check (
    team_id in (select get_user_team_ids(auth.uid()))
  );

create policy "Team members can update route_stops" on route_stops
  for update using (
    team_id in (select get_user_team_ids(auth.uid()))
  );

create policy "Team non-viewers can delete route_stops" on route_stops
  for delete using (
    team_id in (
      select team_id from memberships
      where user_id = auth.uid()
        and status = 'active'
        and role in ('owner', 'admin', 'member')
    )
  );

-- ============================================================
-- 5. Updated_at trigger for routes
-- ============================================================

create trigger update_routes_updated_at
  before update on routes
  for each row
  execute function update_updated_at_column();
