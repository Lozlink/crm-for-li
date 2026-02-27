-- Properties & Listings Migration
-- Adds properties and property_contacts tables with team-scoped RLS

-- ============================================================
-- 1. New Tables
-- ============================================================

create table if not exists properties (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,

  -- Address
  address text not null,
  suburb text,
  state text default 'NSW',
  postcode text,
  latitude float8,
  longitude float8,

  -- Classification
  property_type text not null check (property_type in ('residential', 'commercial')),
  category text not null check (category in (
    'house', 'apartment', 'townhouse', 'land', 'unit', 'villa', 'acreage', 'block_of_units',
    'commercial_office', 'commercial_retail', 'commercial_industrial', 'commercial_other'
  )),
  for_type text not null check (for_type in ('sale', 'lease')),

  -- Pipeline
  status text not null default 'appraisal' check (status in (
    'appraisal', 'available', 'under_offer', 'exchanged', 'settled', 'leased', 'withdrawn'
  )),

  -- Pricing
  appraisal_price numeric,
  advertised_price numeric,
  sale_price numeric,
  commission_percent numeric,

  -- Physical
  beds int,
  baths int,
  cars int,
  land_size_sqm numeric,
  building_size_sqm numeric,

  -- Content
  features text[] default '{}',
  photos text[] default '{}',
  description text,

  -- Agents
  assigned_agents uuid[] default '{}',

  -- Dates
  listed_at timestamptz,
  exchanged_at timestamptz,
  settled_at timestamptz,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists property_contacts (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  role text not null check (role in ('vendor', 'buyer', 'tenant', 'landlord', 'solicitor')),
  created_at timestamptz default now(),
  unique (property_id, contact_id, role)
);

-- Indexes
create index if not exists properties_team_id_idx on properties(team_id);
create index if not exists properties_user_id_idx on properties(user_id);
create index if not exists properties_status_idx on properties(status);
create index if not exists properties_for_type_idx on properties(for_type);
create index if not exists properties_property_type_idx on properties(property_type);
create index if not exists properties_suburb_idx on properties(suburb);
create index if not exists properties_lat_lng_idx on properties(latitude, longitude);
create index if not exists property_contacts_property_id_idx on property_contacts(property_id);
create index if not exists property_contacts_contact_id_idx on property_contacts(contact_id);

-- ============================================================
-- 2. Enable RLS
-- ============================================================

alter table properties enable row level security;
alter table property_contacts enable row level security;

-- ============================================================
-- 3. RLS Policies — Properties
-- ============================================================

create policy "Team members can view properties" on properties
  for select using (
    team_id in (select get_user_team_ids(auth.uid()))
  );

create policy "Team members can create properties" on properties
  for insert with check (
    team_id in (select get_user_team_ids(auth.uid()))
  );

create policy "Team members can update properties" on properties
  for update using (
    team_id in (select get_user_team_ids(auth.uid()))
  );

create policy "Team non-viewers can delete properties" on properties
  for delete using (
    team_id in (
      select team_id from memberships
      where user_id = auth.uid()
        and status = 'active'
        and role in ('owner', 'admin', 'member')
    )
  );

-- ============================================================
-- 4. RLS Policies — Property Contacts
-- ============================================================

create policy "Team members can view property_contacts" on property_contacts
  for select using (
    property_id in (select id from properties where team_id in (select get_user_team_ids(auth.uid())))
  );

create policy "Team members can create property_contacts" on property_contacts
  for insert with check (
    property_id in (select id from properties where team_id in (select get_user_team_ids(auth.uid())))
  );

create policy "Team members can update property_contacts" on property_contacts
  for update using (
    property_id in (select id from properties where team_id in (select get_user_team_ids(auth.uid())))
  );

create policy "Team non-viewers can delete property_contacts" on property_contacts
  for delete using (
    property_id in (
      select id from properties where team_id in (
        select team_id from memberships
        where user_id = auth.uid()
          and status = 'active'
          and role in ('owner', 'admin', 'member')
      )
    )
  );

-- ============================================================
-- 5. Updated_at trigger
-- ============================================================

create trigger update_properties_updated_at
  before update on properties
  for each row
  execute function update_updated_at_column();
