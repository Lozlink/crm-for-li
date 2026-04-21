-- Declared Buildings Migration
-- User-declared multi-dwelling buildings, persisted as first-class entities
-- alongside OSM-derived polygons. Drives coverage metrics and map overlays.

create table if not exists declared_buildings (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  address text not null,
  latitude numeric not null,
  longitude numeric not null,
  estimated_units integer not null check (estimated_units > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Unique per team by normalized address (trimmed, lowercased)
create unique index if not exists declared_buildings_team_addr_idx
  on declared_buildings(team_id, lower(trim(address)));

create index if not exists declared_buildings_team_id_idx on declared_buildings(team_id);

-- RLS
alter table declared_buildings enable row level security;

create policy "Team members can view declared buildings" on declared_buildings
  for select using (team_id in (select get_user_team_ids(auth.uid())));
create policy "Team members can insert declared buildings" on declared_buildings
  for insert with check (team_id in (select get_user_team_ids(auth.uid())));
create policy "Team members can update declared buildings" on declared_buildings
  for update using (team_id in (select get_user_team_ids(auth.uid())));
create policy "Team members can delete declared buildings" on declared_buildings
  for delete using (team_id in (select get_user_team_ids(auth.uid())));

create trigger update_declared_buildings_updated_at
  before update on declared_buildings for each row execute function update_updated_at_column();
