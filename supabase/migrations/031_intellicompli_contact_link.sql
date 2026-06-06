-- IntelliCompli Contact Link Migration
-- Adds the intellicompli_customer_id column to the contacts table so each CRM
-- contact can optionally be linked to an IntelliCompli AML/CTF customer record.
-- The compliance suite is opt-in; this column is null until the agent enables it
-- for a specific contact via useComplianceStore.enableCompliance().

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS intellicompli_customer_id text;

-- Index for fast lookups when hydrating compliance profiles in bulk
-- (useComplianceStore.hydrateProfiles scans contacts with this field set).
CREATE INDEX IF NOT EXISTS contacts_intellicompli_customer_id_idx
  ON contacts(intellicompli_customer_id)
  WHERE intellicompli_customer_id IS NOT NULL;
