-- Whiteboard Items Migration
-- Freeform team canvas: sticky notes, checklists, photos, and (later) live-bound widgets.
-- Phase 1 = one board per team. Future-proof with board_id reserved for multi-board support.

create table if not exists whiteboard_items (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  type text not null check (type in ('sticky', 'checklist', 'photo')),
  position_x numeric not null default 0,
  position_y numeric not null default 0,
  width numeric not null default 220,
  height numeric not null default 220,
  z_index integer not null default 0,
  content jsonb not null default '{}'::jsonb,
  color text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists whiteboard_items_team_id_idx on whiteboard_items(team_id);
create index if not exists whiteboard_items_team_z_idx on whiteboard_items(team_id, z_index);

-- RLS
alter table whiteboard_items enable row level security;

create policy "Team members can view whiteboard items" on whiteboard_items
  for select using (team_id in (select get_user_team_ids(auth.uid())));
create policy "Team members can insert whiteboard items" on whiteboard_items
  for insert with check (team_id in (select get_user_team_ids(auth.uid())));
create policy "Team members can update whiteboard items" on whiteboard_items
  for update using (team_id in (select get_user_team_ids(auth.uid())));
create policy "Team members can delete whiteboard items" on whiteboard_items
  for delete using (team_id in (select get_user_team_ids(auth.uid())));

create trigger update_whiteboard_items_updated_at
  before update on whiteboard_items for each row execute function update_updated_at_column();
