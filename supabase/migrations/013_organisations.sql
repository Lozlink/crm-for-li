-- Organisations (Multi-Office) Migration

create table if not exists organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text,
  settings jsonb default '{}'::jsonb,
  owner_id uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists organisation_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organisation_id uuid not null references organisations(id) on delete cascade,
  role text not null default 'member' check (role in ('org_admin', 'member')),
  created_at timestamptz default now(),
  unique (user_id, organisation_id)
);

-- Add organisation_id to teams
alter table teams add column if not exists organisation_id uuid references organisations(id) on delete set null;
create index if not exists teams_organisation_id_idx on teams(organisation_id);

-- Indexes
create index if not exists organisations_owner_id_idx on organisations(owner_id);
create index if not exists org_memberships_user_id_idx on organisation_memberships(user_id);
create index if not exists org_memberships_org_id_idx on organisation_memberships(organisation_id);

-- RLS
alter table organisations enable row level security;
alter table organisation_memberships enable row level security;

create policy "Org members can view their organisations" on organisations
  for select using (
    id in (select organisation_id from organisation_memberships where user_id = auth.uid())
  );

create policy "Authenticated users can create organisations" on organisations
  for insert with check (auth.uid() is not null);

create policy "Org admins can update organisations" on organisations
  for update using (
    id in (select organisation_id from organisation_memberships where user_id = auth.uid() and role = 'org_admin')
  );

create policy "Org admins can delete organisations" on organisations
  for delete using (
    id in (select organisation_id from organisation_memberships where user_id = auth.uid() and role = 'org_admin')
  );

create policy "Org members can view org memberships" on organisation_memberships
  for select using (
    organisation_id in (select organisation_id from organisation_memberships om where om.user_id = auth.uid())
  );

create policy "Org admins can manage org memberships" on organisation_memberships
  for insert with check (
    organisation_id in (select organisation_id from organisation_memberships om where om.user_id = auth.uid() and om.role = 'org_admin')
    or user_id = auth.uid()
  );

create policy "Org admins can update org memberships" on organisation_memberships
  for update using (
    organisation_id in (select organisation_id from organisation_memberships om where om.user_id = auth.uid() and om.role = 'org_admin')
  );

create policy "Org admins can remove org members" on organisation_memberships
  for delete using (
    organisation_id in (select organisation_id from organisation_memberships om where om.user_id = auth.uid() and om.role = 'org_admin')
    or user_id = auth.uid()
  );

create trigger update_organisations_updated_at
  before update on organisations for each row execute function update_updated_at_column();
