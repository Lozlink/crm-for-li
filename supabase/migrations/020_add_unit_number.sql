-- Add unit_number column to contacts for multi-dwelling address support
-- e.g., "Unit 3", "Apt 2B", "G01" — displayed as "Unit 3 / 45 Smith St"
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS unit_number text;
