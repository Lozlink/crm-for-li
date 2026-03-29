-- Phase 4: Data enrichment tables
-- NSW Valuer General sold history + abs suburb dwelling statistics

-- Sold history from NSW Valuer General quarterly data dumps
CREATE TABLE IF NOT EXISTS sold_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address text NOT NULL,
  suburb text NOT NULL,
  postcode text,
  state text DEFAULT 'NSW',
  property_type text, -- house, unit, townhouse, land, etc.
  sale_price bigint,
  sale_date date,
  settlement_date date,
  area_sqm numeric,
  -- Geocoded location (populated on import or lazily)
  latitude numeric,
  longitude numeric,
  -- Import metadata
  source text DEFAULT 'nsw_vg', -- nsw_vg, manual, corelogic, etc.
  raw_data jsonb, -- original CSV row for audit
  team_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_sold_history_suburb ON sold_history (suburb);
CREATE INDEX IF NOT EXISTS idx_sold_history_sale_date ON sold_history (sale_date DESC);
CREATE INDEX IF NOT EXISTS idx_sold_history_address ON sold_history (address);
CREATE INDEX IF NOT EXISTS idx_sold_history_team ON sold_history (team_id);
CREATE INDEX IF NOT EXISTS idx_sold_history_location ON sold_history (latitude, longitude) WHERE latitude IS NOT NULL;

-- RLS: team-scoped access
ALTER TABLE sold_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY sold_history_select ON sold_history
  FOR SELECT USING (
    team_id IS NULL -- public data (VG imports) visible to all
    OR team_id IN (SELECT get_user_team_ids(auth.uid()))
  );

CREATE POLICY sold_history_insert ON sold_history
  FOR INSERT WITH CHECK (
    team_id IS NULL
    OR team_id IN (SELECT get_user_team_ids(auth.uid()))
  );

-- Suburb statistics from abs census data
CREATE TABLE IF NOT EXISTS suburb_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suburb text NOT NULL,
  state text DEFAULT 'NSW',
  postcode text,
  -- Dwelling data (abs Census)
  total_dwellings integer,
  separate_houses integer,
  semi_detached integer, -- townhouses, terraces
  flats_units integer, -- apartments, units
  other_dwellings integer,
  -- Demographics
  population integer,
  median_household_income integer,
  median_age numeric,
  -- Market data (can be updated from VG or manual entry)
  median_sale_price bigint,
  median_rent_weekly integer,
  avg_days_on_market integer,
  -- Geocoded center
  latitude numeric,
  longitude numeric,
  -- Metadata
  census_year integer DEFAULT 2021,
  source text DEFAULT 'abs',
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_suburb_stats_unique ON suburb_stats (suburb, state);
CREATE INDEX IF NOT EXISTS idx_suburb_stats_location ON suburb_stats (latitude, longitude) WHERE latitude IS NOT NULL;

-- RLS: suburb stats are public reference data
ALTER TABLE suburb_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY suburb_stats_select ON suburb_stats FOR SELECT USING (true);
CREATE POLICY suburb_stats_insert ON suburb_stats FOR INSERT WITH CHECK (true);
CREATE POLICY suburb_stats_update ON suburb_stats FOR UPDATE USING (true);
