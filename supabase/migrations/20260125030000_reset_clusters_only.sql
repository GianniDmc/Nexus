-- Soft Reset: Clear clusters but KEEP articles
-- 1. Detach all articles from their clusters
UPDATE articles 
SET cluster_id = NULL;

-- 2. Delete all clusters (now that they are empty)
TRUNCATE TABLE clusters CASCADE;

-- 3. Reset internal processing flags (optional, for safety)
-- This ensures 'clustering' step picks them up again as 'new'
UPDATE articles 
SET cluster_id = NULL
WHERE cluster_id IS NOT NULL;
