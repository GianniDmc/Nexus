-- Function to get cluster article counts efficiently
-- This aggregates at the database level, avoiding row limits
CREATE OR REPLACE FUNCTION get_cluster_article_counts()
RETURNS TABLE (
  cluster_id uuid,
  article_count bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.cluster_id,
    COUNT(*)::bigint as article_count
  FROM articles a
  WHERE a.cluster_id IS NOT NULL
  GROUP BY a.cluster_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get multi-article clusters with details
CREATE OR REPLACE FUNCTION get_multi_article_clusters()
RETURNS TABLE (
  id uuid,
  label text,
  is_published boolean,
  final_score double precision,
  created_at timestamptz,
  article_count bigint
) AS $$
BEGIN
  RETURN QUERY
  WITH cluster_counts AS (
    SELECT 
      a.cluster_id,
      COUNT(*)::bigint as cnt
    FROM articles a
    WHERE a.cluster_id IS NOT NULL
    GROUP BY a.cluster_id
    HAVING COUNT(*) > 1
  )
  SELECT 
    c.id,
    c.label,
    c.is_published,
    c.final_score,
    c.created_at,
    cc.cnt as article_count
  FROM clusters c
  INNER JOIN cluster_counts cc ON c.id = cc.cluster_id
  ORDER BY cc.cnt DESC, c.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get pipeline stats efficiently
CREATE OR REPLACE FUNCTION get_pipeline_stats()
RETURNS json AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'total', (SELECT COUNT(*) FROM articles),
    'pendingEmbedding', (SELECT COUNT(*) FROM articles WHERE embedding IS NULL),
    'embedded', (SELECT COUNT(*) FROM articles WHERE embedding IS NOT NULL),
    'pendingClustering', (SELECT COUNT(*) FROM articles WHERE embedding IS NOT NULL AND cluster_id IS NULL),
    'clustered', (SELECT COUNT(*) FROM articles WHERE cluster_id IS NOT NULL),
    'pendingScoring', (SELECT COUNT(*) FROM articles WHERE cluster_id IS NOT NULL AND relevance_score IS NULL),
    'scored', (SELECT COUNT(*) FROM articles WHERE relevance_score IS NOT NULL),
    'relevant', (SELECT COUNT(*) FROM articles WHERE final_score >= 5.5),
    'rejected', (SELECT COUNT(*) FROM articles WHERE final_score IS NOT NULL AND final_score < 5.5),
    'ready', (SELECT COUNT(*) FROM articles WHERE summary_short IS NOT NULL AND is_published = false AND final_score >= 5.5),
    'published', (SELECT COUNT(*) FROM articles WHERE is_published = true),
    'clusterCount', (SELECT COUNT(*) FROM clusters),
    'multiArticleClusters', (
      SELECT COUNT(*) FROM (
        SELECT cluster_id FROM articles WHERE cluster_id IS NOT NULL GROUP BY cluster_id HAVING COUNT(*) > 1
      ) sub
    )
  ) INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;
