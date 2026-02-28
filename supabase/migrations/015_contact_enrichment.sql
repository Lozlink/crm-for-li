-- Contact Enrichment Migration
-- Adds lifecycle, source, and CRM fields to contacts table

alter table contacts
  add column if not exists source text check (source in ('referral', 'web', 'walk_in', 'portal', 'phone', 'import')),
  add column if not exists contact_type text check (contact_type in ('buyer', 'seller', 'tenant', 'landlord', 'investor', 'other')),
  add column if not exists company_name text,
  add column if not exists title text,
  add column if not exists preferred_contact_method text check (preferred_contact_method in ('phone', 'email', 'sms')),
  add column if not exists do_not_contact boolean not null default false,
  add column if not exists notes text,
  add column if not exists status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  add column if not exists lead_score integer check (lead_score >= 0 and lead_score <= 100),
  add column if not exists last_contacted_at timestamptz,
  add column if not exists next_follow_up_at timestamptz;

-- Indexes for common filters
create index if not exists contacts_status_idx on contacts (status);
create index if not exists contacts_contact_type_idx on contacts (contact_type);
create index if not exists contacts_next_follow_up_idx on contacts (next_follow_up_at) where next_follow_up_at is not null;
