-- SMS Templates + Labels Migration
-- Templates and labels are sibling entities. A template is the message body + name.
-- A label is a categorical context tag (e.g. "Open Home", "Follow-up"). Templates
-- and labels are linked via the sms_template_labels junction table — many-to-many,
-- so one template can carry multiple labels and one label can apply to many templates.
-- Both used by the bulk SMS modal and the async SMS campaigns flow.

-- ---------- sms_labels ----------
create table if not exists sms_labels (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  name text not null,
  color text not null default '#6366F1',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Names unique per team, case-insensitive on the trimmed value
create unique index if not exists sms_labels_team_name_idx
  on sms_labels(team_id, lower(trim(name)));

create index if not exists sms_labels_team_id_idx on sms_labels(team_id);

alter table sms_labels enable row level security;

create policy "Team members can view sms labels" on sms_labels
  for select using (team_id in (select get_user_team_ids(auth.uid())));
create policy "Team members can insert sms labels" on sms_labels
  for insert with check (team_id in (select get_user_team_ids(auth.uid())));
create policy "Team members can update sms labels" on sms_labels
  for update using (team_id in (select get_user_team_ids(auth.uid())));
create policy "Team members can delete sms labels" on sms_labels
  for delete using (team_id in (select get_user_team_ids(auth.uid())));

create trigger update_sms_labels_updated_at
  before update on sms_labels for each row execute function update_updated_at_column();

-- ---------- sms_templates ----------
create table if not exists sms_templates (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  name text not null,
  message text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists sms_templates_team_name_idx
  on sms_templates(team_id, lower(trim(name)));

create index if not exists sms_templates_team_id_idx on sms_templates(team_id);

alter table sms_templates enable row level security;

create policy "Team members can view sms templates" on sms_templates
  for select using (team_id in (select get_user_team_ids(auth.uid())));
create policy "Team members can insert sms templates" on sms_templates
  for insert with check (team_id in (select get_user_team_ids(auth.uid())));
create policy "Team members can update sms templates" on sms_templates
  for update using (team_id in (select get_user_team_ids(auth.uid())));
create policy "Team members can delete sms templates" on sms_templates
  for delete using (team_id in (select get_user_team_ids(auth.uid())));

create trigger update_sms_templates_updated_at
  before update on sms_templates for each row execute function update_updated_at_column();

-- ---------- sms_template_labels (junction) ----------
-- Templates and labels coexist as sibling entities; this junction associates them.
create table if not exists sms_template_labels (
  template_id uuid not null references sms_templates(id) on delete cascade,
  label_id uuid not null references sms_labels(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (template_id, label_id)
);

create index if not exists sms_template_labels_label_idx on sms_template_labels(label_id);

alter table sms_template_labels enable row level security;

-- Junction RLS: visible/writable when both ends are in the user's team(s)
create policy "Team members can view template-label links" on sms_template_labels
  for select using (
    template_id in (select id from sms_templates where team_id in (select get_user_team_ids(auth.uid())))
  );
create policy "Team members can insert template-label links" on sms_template_labels
  for insert with check (
    template_id in (select id from sms_templates where team_id in (select get_user_team_ids(auth.uid())))
  );
create policy "Team members can delete template-label links" on sms_template_labels
  for delete using (
    template_id in (select id from sms_templates where team_id in (select get_user_team_ids(auth.uid())))
  );
