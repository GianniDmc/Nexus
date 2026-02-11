-- Pipeline hot paths
CREATE INDEX IF NOT EXISTS idx_articles_needs_embedding
  ON articles (created_at)
  WHERE embedding IS NULL;

CREATE INDEX IF NOT EXISTS idx_articles_needs_clustering
  ON articles (created_at)
  WHERE embedding IS NOT NULL AND cluster_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_articles_cluster_score
  ON articles (cluster_id, final_score DESC)
  WHERE cluster_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_articles_recent_clustered
  ON articles (published_at DESC, cluster_id)
  WHERE cluster_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_articles_created_at_desc
  ON articles (created_at DESC);

-- Admin/API filtering hot paths
CREATE INDEX IF NOT EXISTS idx_clusters_publish_candidates
  ON clusters (is_published, final_score DESC)
  WHERE final_score IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clusters_unscored
  ON clusters (id)
  WHERE final_score IS NULL;
