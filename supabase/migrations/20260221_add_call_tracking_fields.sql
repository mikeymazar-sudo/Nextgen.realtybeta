-- Add call tracking fields to properties table
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS unanswered_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_called_at timestamptz,
  ADD COLUMN IF NOT EXISTS has_been_answered boolean DEFAULT false;

-- Rename reach_out status to follow_up for any existing records
UPDATE properties SET status = 'follow_up' WHERE status = 'reach_out';

-- Atomic increment function for unanswered call tracking
CREATE OR REPLACE FUNCTION increment_unanswered(prop_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE properties
  SET unanswered_count = COALESCE(unanswered_count, 0) + 1,
      last_called_at = now()
  WHERE id = prop_id;
END;
$$ LANGUAGE plpgsql;
