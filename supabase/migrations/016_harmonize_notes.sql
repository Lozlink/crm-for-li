-- Notes Harmonization Migration
-- Links tracking_annotations to activities for unified notes view

-- Add tracking annotation reference and source to activities
ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS tracking_annotation_id UUID REFERENCES tracking_annotations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source TEXT CHECK (source IN ('office', 'field', 'call', 'tracking', 'inspection', 'import'));

CREATE INDEX IF NOT EXISTS idx_activities_tracking_annotation ON activities(tracking_annotation_id) WHERE tracking_annotation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activities_source ON activities(source) WHERE source IS NOT NULL;

-- Backfill: create activity records for existing tracking_annotations that have a contact_id
INSERT INTO activities (contact_id, type, content, source, tracking_annotation_id, user_id, team_id, created_at)
SELECT
  ta.contact_id,
  'note',
  ta.note,
  'tracking',
  ta.id,
  ta.user_id,
  ta.team_id,
  ta.created_at
FROM tracking_annotations ta
WHERE ta.contact_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM activities a WHERE a.tracking_annotation_id = ta.id
  );
