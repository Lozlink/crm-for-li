-- Saved Searches Migration

create table if not exists saved_searches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  entity_type text not null check (entity_type in ('contact', 'property')),
  filters jsonb not null default '{}'::jsonb,
  user_id uuid references auth.users(id) on delete cascade,
  team_id uuid references teams(id) on delete cascade,
  is_shared boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists saved_searches_team_id_idx on saved_searches(team_id);
create index if not exists saved_searches_user_id_idx on saved_searches(user_id);
create index if not exists saved_searches_entity_type_idx on saved_searches(entity_type);

alter table saved_searches enable row level security;

-- Users can see their own + shared searches from their teams
create policy "Users can view saved searches" on saved_searches
  for select using (
    user_id = auth.uid()
    or (is_shared = true and team_id in (select get_user_team_ids(auth.uid())))
  );

create policy "Users can create saved searches" on saved_searches
  for insert with check (
    user_id = auth.uid() and team_id in (select get_user_team_ids(auth.uid()))
  );

create policy "Users can update own saved searches" on saved_searches
  for update using (user_id = auth.uid());

create policy "Users can delete own saved searches" on saved_searches
  for delete using (user_id = auth.uid());

create trigger update_saved_searches_updated_at
  before update on saved_searches for each row execute function update_updated_at_column();
