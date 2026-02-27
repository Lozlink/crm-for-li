-- Tasks & Appointments Migration

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  title text not null,
  description text,
  type text not null default 'task' check (type in ('task', 'appointment', 'follow_up', 'inspection_reminder')),
  status text not null default 'pending' check (status in ('pending', 'completed', 'overdue')),
  due_at timestamptz,
  completed_at timestamptz,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  assigned_to uuid references auth.users(id) on delete set null,
  contact_id uuid references contacts(id) on delete set null,
  property_id uuid references properties(id) on delete set null,
  inspection_id uuid references inspections(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes
create index if not exists tasks_team_id_idx on tasks(team_id);
create index if not exists tasks_assigned_to_idx on tasks(assigned_to);
create index if not exists tasks_status_idx on tasks(status);
create index if not exists tasks_due_at_idx on tasks(due_at);
create index if not exists tasks_contact_id_idx on tasks(contact_id);
create index if not exists tasks_property_id_idx on tasks(property_id);
create index if not exists tasks_inspection_id_idx on tasks(inspection_id);

-- RLS
alter table tasks enable row level security;

create policy "Team members can view tasks" on tasks
  for select using (team_id in (select get_user_team_ids(auth.uid())));
create policy "Team members can create tasks" on tasks
  for insert with check (team_id in (select get_user_team_ids(auth.uid())));
create policy "Team members can update tasks" on tasks
  for update using (team_id in (select get_user_team_ids(auth.uid())));
create policy "Team non-viewers can delete tasks" on tasks
  for delete using (
    team_id in (select team_id from memberships where user_id = auth.uid() and status = 'active' and role in ('owner', 'admin', 'member'))
  );

create trigger update_tasks_updated_at
  before update on tasks for each row execute function update_updated_at_column();
