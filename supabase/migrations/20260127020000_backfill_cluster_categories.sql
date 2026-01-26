-- Backfill clusters.category from associated articles
-- We take the category of *any* article in the cluster.
-- Since we harmonized articles.category, this will propagate the clean categories to the clusters.

UPDATE clusters c
SET category = sub.category
FROM (
    SELECT DISTINCT ON (cluster_id) cluster_id, category
    FROM articles
    WHERE cluster_id IS NOT NULL AND category IS NOT NULL
) sub
WHERE c.id = sub.cluster_id
AND c.category IS NULL;
