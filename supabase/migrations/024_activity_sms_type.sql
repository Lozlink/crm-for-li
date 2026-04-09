-- Add 'sms' to activities.type CHECK constraint
ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_type_check;
ALTER TABLE activities ADD CONSTRAINT activities_type_check
  CHECK (type IN ('note', 'call', 'meeting', 'email', 'sms'));
