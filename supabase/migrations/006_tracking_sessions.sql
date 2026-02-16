CREATE TABLE tracking_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  team_id UUID REFERENCES teams(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  total_distance_meters REAL,
  duration_seconds INTEGER,
  polyline TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE tracking_breadcrumbs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES tracking_sessions(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  altitude REAL,
  speed REAL,
  heading REAL,
  accuracy REAL,
  recorded_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_tracking_sessions_user ON tracking_sessions(user_id);
CREATE INDEX idx_tracking_sessions_team ON tracking_sessions(team_id);
CREATE INDEX idx_tracking_sessions_status ON tracking_sessions(status);
CREATE INDEX idx_tracking_breadcrumbs_session ON tracking_breadcrumbs(session_id);
CREATE INDEX idx_tracking_breadcrumbs_recorded ON tracking_breadcrumbs(recorded_at);

ALTER TABLE tracking_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracking_breadcrumbs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own sessions"
  ON tracking_sessions FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own breadcrumbs"
  ON tracking_breadcrumbs FOR ALL
  USING (session_id IN (
    SELECT id FROM tracking_sessions WHERE user_id = auth.uid()
  ));
