-- Real Estate CRM Database Schema
-- Run this migration in your Supabase SQL Editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Tags table
create table if not exists tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null,
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

-- Contacts table
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text,
  email text,
  phone text,
  address text,
  latitude float8,
  longitude float8,
  tag_id uuid references tags(id) on delete set null,
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Activity feed table
create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references contacts(id) on delete cascade not null,
  type text not null check (type in ('note', 'call', 'meeting', 'email')),
  content text,
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

-- Indexes for better query performance
create index if not exists contacts_user_id_idx on contacts(user_id);
create index if not exists contacts_tag_id_idx on contacts(tag_id);
create index if not exists contacts_location_idx on contacts(latitude, longitude);
create index if not exists activities_contact_id_idx on activities(contact_id);
create index if not exists tags_user_id_idx on tags(user_id);

-- Row Level Security (RLS)
alter table tags enable row level security;
alter table contacts enable row level security;
alter table activities enable row level security;

-- Policies for tags
create policy "Users can view their own tags" on tags
  for select using (auth.uid() = user_id);

create policy "Users can create their own tags" on tags
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own tags" on tags
  for update using (auth.uid() = user_id);

create policy "Users can delete their own tags" on tags
  for delete using (auth.uid() = user_id);

-- Policies for contacts
create policy "Users can view their own contacts" on contacts
  for select using (auth.uid() = user_id);

create policy "Users can create their own contacts" on contacts
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own contacts" on contacts
  for update using (auth.uid() = user_id);

create policy "Users can delete their own contacts" on contacts
  for delete using (auth.uid() = user_id);

-- Policies for activities
create policy "Users can view their own activities" on activities
  for select using (auth.uid() = user_id);

create policy "Users can create their own activities" on activities
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own activities" on activities
  for update using (auth.uid() = user_id);

create policy "Users can delete their own activities" on activities
  for delete using (auth.uid() = user_id);

-- Function to automatically update updated_at timestamp
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Trigger to update updated_at on contacts
create trigger update_contacts_updated_at
  before update on contacts
  for each row
  execute function update_updated_at_column();
