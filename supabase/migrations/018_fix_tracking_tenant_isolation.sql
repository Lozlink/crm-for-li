-- Fix tracking_sessions RLS: scope to team, not just user
DROP POLICY IF EXISTS "Users can manage own sessions" ON tracking_sessions;

-- Team members can view all sessions within their team
CREATE POLICY "Team members can view sessions" ON tracking_sessions
  FOR SELECT USING (team_id IN (SELECT get_user_team_ids(auth.uid())));

-- Users can insert/update/delete only their own sessions (within their teams)
CREATE POLICY "Users can manage own sessions" ON tracking_sessions
  FOR ALL USING (
    auth.uid() = user_id
    AND team_id IN (SELECT get_user_team_ids(auth.uid()))
  );

-- Fix tracking_breadcrumbs RLS: scope via session's team_id
DROP POLICY IF EXISTS "Users can manage own breadcrumbs" ON tracking_breadcrumbs;

CREATE POLICY "Team members can view breadcrumbs" ON tracking_breadcrumbs
  FOR SELECT USING (session_id IN (
    SELECT id FROM tracking_sessions WHERE team_id IN (SELECT get_user_team_ids(auth.uid()))
  ));

CREATE POLICY "Users can manage own breadcrumbs" ON tracking_breadcrumbs
  FOR ALL USING (session_id IN (
    SELECT id FROM tracking_sessions
    WHERE user_id = auth.uid()
    AND team_id IN (SELECT get_user_team_ids(auth.uid()))
  ));

-- Add team_id column to tracking_breadcrumbs for direct filtering
ALTER TABLE tracking_breadcrumbs ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);

-- Backfill team_id from parent session
UPDATE tracking_breadcrumbs b
SET team_id = s.team_id
FROM tracking_sessions s
WHERE b.session_id = s.id AND b.team_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_tracking_breadcrumbs_team ON tracking_breadcrumbs(team_id);

-- Fix email_recipients: add DELETE policy
CREATE POLICY "Team members can delete recipients" ON email_recipients
  FOR DELETE USING (campaign_id IN (
    SELECT id FROM email_campaigns WHERE team_id IN (SELECT get_user_team_ids(auth.uid()))
  ));
