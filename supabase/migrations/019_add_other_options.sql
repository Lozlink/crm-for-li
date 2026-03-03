-- Add 'other' to contacts.source CHECK constraint
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_source_check;
ALTER TABLE contacts ADD CONSTRAINT contacts_source_check
  CHECK (source IN ('referral', 'web', 'walk_in', 'portal', 'phone', 'import', 'other'));

-- Add 'other' to contacts.preferred_contact_method CHECK constraint
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_preferred_contact_method_check;
ALTER TABLE contacts ADD CONSTRAINT contacts_preferred_contact_method_check
  CHECK (preferred_contact_method IN ('phone', 'email', 'sms', 'other'));

-- Add 'other' to properties.category CHECK constraint
ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_category_check;
ALTER TABLE properties ADD CONSTRAINT properties_category_check
  CHECK (category IN (
    'house', 'apartment', 'townhouse', 'land', 'unit', 'villa', 'acreage', 'block_of_units', 'other',
    'commercial_office', 'commercial_retail', 'commercial_industrial', 'commercial_other'
  ));
