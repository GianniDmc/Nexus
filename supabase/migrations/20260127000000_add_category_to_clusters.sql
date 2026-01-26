-- Add category column to clusters table
ALTER TABLE clusters ADD COLUMN IF NOT EXISTS category TEXT;

-- Create an index for faster filtering by category
CREATE INDEX IF NOT EXISTS idx_clusters_category ON clusters(category);
