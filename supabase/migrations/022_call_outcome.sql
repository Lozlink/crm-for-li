-- Add call_outcome column to activities for tracking phone call results
ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS call_outcome text
    CHECK (call_outcome IN ('connected', 'no_answer', 'voicemail', 'wrong_number', 'busy'));
