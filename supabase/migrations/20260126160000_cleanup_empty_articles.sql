-- cleanup_empty_summaries.sql

-- 1. Identify clusters that are marked 'published' but have NO entry in 'summaries' table
UPDATE clusters
SET is_published = false, label = NULL, published_on = NULL
WHERE is_published = true
AND id NOT IN (SELECT cluster_id FROM summaries);

-- 2. Identify clusters that have a summary entry but with empty content/title
UPDATE clusters
SET is_published = false, label = NULL, published_on = NULL
WHERE is_published = true
AND id IN (
    SELECT cluster_id 
    FROM summaries 
    WHERE length(title) < 5 OR length(content_full) < 50 OR title IS NULL OR content_full IS NULL
);

-- 3. Delete the bad summary rows themselves so they don't block re-insertion
DELETE FROM summaries
WHERE length(title) < 5 OR length(content_full) < 50 OR title IS NULL OR content_full IS NULL;

-- 4. Reset App State if stuck (just in case)
DELETE FROM app_state WHERE key = 'processing_state';
