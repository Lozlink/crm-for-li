-- Inspections Migration
-- Open home and private inspection scheduling with attendee tracking

create table if not exists inspections (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  team_id uuid references teams(id) on delete cascade,
  agent_id uuid references auth.users(id) on delete set null,
  scheduled_at timestamptz not null,
  duration_minutes int not null default 30,
  type text not null default 'open_home' check (type in ('open_home', 'private')),
  status text not null default 'scheduled' check (status in ('scheduled', 'in_progress', 'completed', 'cancelled')),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists inspection_attendees (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references inspections(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  first_name text not null,
  last_name text,
  phone text,
  email text,
  source text not null default 'walk_in' check (source in ('walk_in', 'registered', 'invited')),
  feedback text,
  interest_level text check (interest_level in ('hot', 'warm', 'cold')),
  created_at timestamptz default now()
);

-- Indexes
create index if not exists inspections_property_id_idx on inspections(property_id);
create index if not exists inspections_team_id_idx on inspections(team_id);
create index if not exists inspections_agent_id_idx on inspections(agent_id);
create index if not exists inspections_scheduled_at_idx on inspections(scheduled_at);
create index if not exists inspections_status_idx on inspections(status);
create index if not exists inspection_attendees_inspection_id_idx on inspection_attendees(inspection_id);
create index if not exists inspection_attendees_contact_id_idx on inspection_attendees(contact_id);

-- RLS
alter table inspections enable row level security;
alter table inspection_attendees enable row level security;

create policy "Team members can view inspections" on inspections
  for select using (team_id in (select get_user_team_ids(auth.uid())));
create policy "Team members can create inspections" on inspections
  for insert with check (team_id in (select get_user_team_ids(auth.uid())));
create policy "Team members can update inspections" on inspections
  for update using (team_id in (select get_user_team_ids(auth.uid())));
create policy "Team non-viewers can delete inspections" on inspections
  for delete using (
    team_id in (select team_id from memberships where user_id = auth.uid() and status = 'active' and role in ('owner', 'admin', 'member'))
  );

create policy "Team members can view inspection_attendees" on inspection_attendees
  for select using (
    inspection_id in (select id from inspections where team_id in (select get_user_team_ids(auth.uid())))
  );
create policy "Team members can create inspection_attendees" on inspection_attendees
  for insert with check (
    inspection_id in (select id from inspections where team_id in (select get_user_team_ids(auth.uid())))
  );
create policy "Team members can update inspection_attendees" on inspection_attendees
  for update using (
    inspection_id in (select id from inspections where team_id in (select get_user_team_ids(auth.uid())))
  );
create policy "Team non-viewers can delete inspection_attendees" on inspection_attendees
  for delete using (
    inspection_id in (select id from inspections where team_id in (
      select team_id from memberships where user_id = auth.uid() and status = 'active' and role in ('owner', 'admin', 'member')
    ))
  );

create trigger update_inspections_updated_at
  before update on inspections for each row execute function update_updated_at_column();
