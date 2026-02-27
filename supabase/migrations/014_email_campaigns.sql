-- Email Campaigns Migration

create table if not exists email_campaigns (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  name text not null,
  subject text not null,
  body_html text,
  body_text text,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'sending', 'sent')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  sender_id uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists email_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references email_campaigns(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  email text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'delivered', 'opened', 'bounced', 'unsubscribed')),
  sent_at timestamptz,
  opened_at timestamptz
);

create table if not exists contact_subscriptions (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id) on delete cascade,
  team_id uuid references teams(id) on delete cascade,
  subscribed boolean default true,
  unsubscribed_at timestamptz,
  unsubscribe_reason text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (contact_id, team_id)
);

-- Indexes
create index if not exists email_campaigns_team_id_idx on email_campaigns(team_id);
create index if not exists email_campaigns_status_idx on email_campaigns(status);
create index if not exists email_recipients_campaign_id_idx on email_recipients(campaign_id);
create index if not exists email_recipients_contact_id_idx on email_recipients(contact_id);
create index if not exists contact_subscriptions_contact_id_idx on contact_subscriptions(contact_id);
create index if not exists contact_subscriptions_team_id_idx on contact_subscriptions(team_id);

-- RLS
alter table email_campaigns enable row level security;
alter table email_recipients enable row level security;
alter table contact_subscriptions enable row level security;

create policy "Team members can view campaigns" on email_campaigns
  for select using (team_id in (select get_user_team_ids(auth.uid())));
create policy "Team members can create campaigns" on email_campaigns
  for insert with check (team_id in (select get_user_team_ids(auth.uid())));
create policy "Team members can update campaigns" on email_campaigns
  for update using (team_id in (select get_user_team_ids(auth.uid())));
create policy "Team non-viewers can delete campaigns" on email_campaigns
  for delete using (
    team_id in (select team_id from memberships where user_id = auth.uid() and status = 'active' and role in ('owner', 'admin', 'member'))
  );

create policy "Team members can view recipients" on email_recipients
  for select using (
    campaign_id in (select id from email_campaigns where team_id in (select get_user_team_ids(auth.uid())))
  );
create policy "Team members can create recipients" on email_recipients
  for insert with check (
    campaign_id in (select id from email_campaigns where team_id in (select get_user_team_ids(auth.uid())))
  );
create policy "Team members can update recipients" on email_recipients
  for update using (
    campaign_id in (select id from email_campaigns where team_id in (select get_user_team_ids(auth.uid())))
  );

create policy "Team members can view subscriptions" on contact_subscriptions
  for select using (team_id in (select get_user_team_ids(auth.uid())));
create policy "Team members can create subscriptions" on contact_subscriptions
  for insert with check (team_id in (select get_user_team_ids(auth.uid())));
create policy "Team members can update subscriptions" on contact_subscriptions
  for update using (team_id in (select get_user_team_ids(auth.uid())));

create trigger update_email_campaigns_updated_at
  before update on email_campaigns for each row execute function update_updated_at_column();
create trigger update_contact_subscriptions_updated_at
  before update on contact_subscriptions for each row execute function update_updated_at_column();
