-- Contact Requirements Migration
-- Buyer/tenant matching criteria stored per contact

create table if not exists contact_requirements (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id) on delete cascade,
  team_id uuid references teams(id) on delete cascade,
  for_type text not null check (for_type in ('buy', 'rent')),
  property_types text[] default '{}',
  categories text[] default '{}',
  suburbs text[] default '{}',
  price_min numeric,
  price_max numeric,
  beds_min int,
  baths_min int,
  cars_min int,
  land_size_min numeric,
  building_size_min numeric,
  features text[] default '{}',
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes
create index if not exists contact_requirements_contact_id_idx on contact_requirements(contact_id);
create index if not exists contact_requirements_team_id_idx on contact_requirements(team_id);
create index if not exists contact_requirements_for_type_idx on contact_requirements(for_type);
create index if not exists contact_requirements_active_idx on contact_requirements(active);

-- RLS
alter table contact_requirements enable row level security;

create policy "Team members can view contact_requirements" on contact_requirements
  for select using (team_id in (select get_user_team_ids(auth.uid())));

create policy "Team members can create contact_requirements" on contact_requirements
  for insert with check (team_id in (select get_user_team_ids(auth.uid())));

create policy "Team members can update contact_requirements" on contact_requirements
  for update using (team_id in (select get_user_team_ids(auth.uid())));

create policy "Team non-viewers can delete contact_requirements" on contact_requirements
  for delete using (
    team_id in (
      select team_id from memberships
      where user_id = auth.uid() and status = 'active' and role in ('owner', 'admin', 'member')
    )
  );

create trigger update_contact_requirements_updated_at
  before update on contact_requirements for each row execute function update_updated_at_column();
