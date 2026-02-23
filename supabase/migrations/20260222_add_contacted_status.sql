-- Add 'contacted' status support and update increment_unanswered to auto-move leads

-- Update the increment_unanswered RPC to also set status = 'contacted' for new leads
CREATE OR REPLACE FUNCTION increment_unanswered(prop_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE properties
  SET unanswered_count = COALESCE(unanswered_count, 0) + 1,
      last_called_at = now(),
      status = CASE WHEN status = 'new' THEN 'contacted' ELSE status END,
      status_changed_at = CASE WHEN status = 'new' THEN now() ELSE status_changed_at END
  WHERE id = prop_id;
END;
$$ LANGUAGE plpgsql;
