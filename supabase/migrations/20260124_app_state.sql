-- Create app_state table for storing application state like processing status
CREATE TABLE IF NOT EXISTS app_state (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_app_state_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER app_state_updated_at
  BEFORE UPDATE ON app_state
  FOR EACH ROW
  EXECUTE FUNCTION update_app_state_timestamp();

-- Insert initial processing state
INSERT INTO app_state (key, value) 
VALUES ('processing_state', '{"isRunning": false, "step": null, "startedAt": null, "shouldStop": false}'::jsonb)
ON CONFLICT (key) DO NOTHING;
