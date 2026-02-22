-- Tracking Annotations Migration
-- Adds tracking_annotations table for field notes dropped during tracking sessions

CREATE TABLE tracking_annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES tracking_sessions(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  note TEXT NOT NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id),
  team_id UUID REFERENCES teams(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_tracking_annotations_session ON tracking_annotations(session_id);
CREATE INDEX idx_tracking_annotations_team ON tracking_annotations(team_id);
CREATE INDEX idx_tracking_annotations_contact ON tracking_annotations(contact_id);

ALTER TABLE tracking_annotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view tracking_annotations" ON tracking_annotations
  FOR SELECT USING (
    team_id IN (SELECT get_user_team_ids(auth.uid()))
  );

CREATE POLICY "Team members can create tracking_annotations" ON tracking_annotations
  FOR INSERT WITH CHECK (
    team_id IN (SELECT get_user_team_ids(auth.uid()))
  );

CREATE POLICY "Team members can update tracking_annotations" ON tracking_annotations
  FOR UPDATE USING (
    team_id IN (SELECT get_user_team_ids(auth.uid()))
  );

CREATE POLICY "Team members can delete tracking_annotations" ON tracking_annotations
  FOR DELETE USING (
    team_id IN (SELECT get_user_team_ids(auth.uid()))
  );
