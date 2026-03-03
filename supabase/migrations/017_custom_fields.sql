-- Custom field definitions
CREATE TABLE custom_field_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('contact', 'property', 'contact_requirement', 'inspection', 'task')),
  field_name TEXT NOT NULL,
  field_label TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK (field_type IN ('text', 'number', 'boolean', 'date', 'single_select', 'multi_select')),
  options JSONB DEFAULT '[]'::jsonb,
  is_required BOOLEAN DEFAULT false,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (team_id, entity_type, field_name)
);

CREATE INDEX idx_cfd_team_entity ON custom_field_definitions(team_id, entity_type);

-- Custom field values
CREATE TABLE custom_field_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id UUID NOT NULL REFERENCES custom_field_definitions(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL,
  entity_type TEXT NOT NULL,
  value_text TEXT,
  value_number NUMERIC,
  value_boolean BOOLEAN,
  value_date DATE,
  value_json JSONB,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (definition_id, entity_id)
);

CREATE INDEX idx_cfv_entity ON custom_field_values(entity_type, entity_id);
CREATE INDEX idx_cfv_definition ON custom_field_values(definition_id);
CREATE INDEX idx_cfv_team ON custom_field_values(team_id);

-- RLS
ALTER TABLE custom_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_field_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view field definitions" ON custom_field_definitions
  FOR SELECT USING (team_id IN (SELECT get_user_team_ids(auth.uid())));
CREATE POLICY "Team admins can manage field definitions" ON custom_field_definitions
  FOR ALL USING (team_id IN (
    SELECT team_id FROM memberships WHERE user_id = auth.uid() AND status = 'active' AND role IN ('owner', 'admin')
  ));

CREATE POLICY "Team members can view field values" ON custom_field_values
  FOR SELECT USING (team_id IN (SELECT get_user_team_ids(auth.uid())));
CREATE POLICY "Team members can manage field values" ON custom_field_values
  FOR ALL USING (team_id IN (SELECT get_user_team_ids(auth.uid())));
