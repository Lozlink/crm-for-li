-- SMS Campaigns Migration
-- Provider options for AU market:
--   Twilio:       ~AU$0.08–0.10/SMS outbound (international provider, good AU coverage)
--   MessageMedia: ~AU$0.06–0.08/SMS outbound (AU-native, strong compliance, recommended)
--   Burst SMS:    ~AU$0.06/SMS outbound (AU-native, competitive pricing)
-- Recommendation: MessageMedia or Burst SMS for AU-native compliance (ACMA/SPAM Act)

create table if not exists sms_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  message_template text not null,
  status text not null default 'draft' check (status in ('draft', 'sending', 'sent', 'failed')),
  recipient_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  scheduled_at timestamptz,
  sent_at timestamptz,
  user_id uuid references auth.users(id) on delete set null,
  team_id uuid references teams(id) on delete cascade,
  created_at timestamptz default now()
);

create table if not exists sms_messages (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references sms_campaigns(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  phone_number text not null,
  message_body text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'delivered', 'failed', 'bounced')),
  sent_at timestamptz,
  delivered_at timestamptz,
  error_message text,
  user_id uuid references auth.users(id) on delete set null,
  team_id uuid references teams(id) on delete cascade,
  created_at timestamptz default now()
);

create table if not exists sms_opt_outs (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null,
  opted_out_at timestamptz not null default now(),
  team_id uuid references teams(id) on delete cascade,
  unique (phone_number, team_id)
);

-- Indexes
create index if not exists sms_campaigns_team_id_idx on sms_campaigns(team_id);
create index if not exists sms_campaigns_status_idx on sms_campaigns(status);
create index if not exists sms_messages_campaign_id_idx on sms_messages(campaign_id);
create index if not exists sms_messages_contact_id_idx on sms_messages(contact_id);
create index if not exists sms_messages_team_id_idx on sms_messages(team_id);
create index if not exists sms_opt_outs_phone_team_idx on sms_opt_outs(phone_number, team_id);

-- RLS
alter table sms_campaigns enable row level security;
alter table sms_messages enable row level security;
alter table sms_opt_outs enable row level security;

create policy "Team members can view sms campaigns" on sms_campaigns
  for select using (team_id in (select get_user_team_ids(auth.uid())));
create policy "Team members can create sms campaigns" on sms_campaigns
  for insert with check (team_id in (select get_user_team_ids(auth.uid())));
create policy "Team members can update sms campaigns" on sms_campaigns
  for update using (team_id in (select get_user_team_ids(auth.uid())));
create policy "Team non-viewers can delete sms campaigns" on sms_campaigns
  for delete using (
    team_id in (select team_id from memberships where user_id = auth.uid() and status = 'active' and role in ('owner', 'admin', 'member'))
  );

create policy "Team members can view sms messages" on sms_messages
  for select using (team_id in (select get_user_team_ids(auth.uid())));
create policy "Team members can create sms messages" on sms_messages
  for insert with check (team_id in (select get_user_team_ids(auth.uid())));
create policy "Team members can update sms messages" on sms_messages
  for update using (team_id in (select get_user_team_ids(auth.uid())));

create policy "Team members can view sms opt outs" on sms_opt_outs
  for select using (team_id in (select get_user_team_ids(auth.uid())));
create policy "Team members can create sms opt outs" on sms_opt_outs
  for insert with check (team_id in (select get_user_team_ids(auth.uid())));
create policy "Team members can delete sms opt outs" on sms_opt_outs
  for delete using (
    team_id in (select team_id from memberships where user_id = auth.uid() and status = 'active' and role in ('owner', 'admin', 'member'))
  );
