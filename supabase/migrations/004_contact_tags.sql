-- Multi-tag support: junction table for contacts <-> tags (many-to-many)
-- Keeps existing tag_id column on contacts for backward compatibility

-- ============================================================
-- 1. Create contact_tags junction table
-- ============================================================

create table if not exists contact_tags (
  contact_id uuid not null references contacts(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  team_id uuid references teams(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (contact_id, tag_id)
);

-- Indexes for efficient lookups
create index if not exists contact_tags_contact_id_idx on contact_tags(contact_id);
create index if not exists contact_tags_tag_id_idx on contact_tags(tag_id);
create index if not exists contact_tags_team_id_idx on contact_tags(team_id);

-- ============================================================
-- 2. Migrate existing tag_id data
-- ============================================================

insert into contact_tags (contact_id, tag_id, team_id)
select id, tag_id, team_id
from contacts
where tag_id is not null
on conflict (contact_id, tag_id) do nothing;

-- ============================================================
-- 3. Enable RLS
-- ============================================================

alter table contact_tags enable row level security;

-- ============================================================
-- 4. RLS policies (matching existing contacts/tags pattern)
-- ============================================================

-- SELECT: team members + legacy fallback
create policy "Team members can view contact_tags" on contact_tags
  for select using (
    team_id in (select get_user_team_ids(auth.uid()))
    or (team_id is null and contact_id in (
      select id from contacts where user_id = auth.uid()
    ))
  );

-- INSERT: team members + legacy fallback
create policy "Team members can create contact_tags" on contact_tags
  for insert with check (
    team_id in (select get_user_team_ids(auth.uid()))
    or (team_id is null and contact_id in (
      select id from contacts where user_id = auth.uid()
    ))
  );

-- UPDATE: team members + legacy fallback
create policy "Team members can update contact_tags" on contact_tags
  for update using (
    team_id in (select get_user_team_ids(auth.uid()))
    or (team_id is null and contact_id in (
      select id from contacts where user_id = auth.uid()
    ))
  );

-- DELETE: non-viewers (owner/admin/member)
create policy "Team non-viewers can delete contact_tags" on contact_tags
  for delete using (
    team_id in (
      select team_id from memberships
      where user_id = auth.uid()
        and status = 'active'
        and role in ('owner', 'admin', 'member')
    )
  );
