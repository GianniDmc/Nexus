CREATE INDEX IF NOT EXISTS idx_articles_cluster_id ON articles(cluster_id);
CREATE INDEX IF NOT EXISTS idx_clusters_is_published ON clusters(is_published);
CREATE INDEX IF NOT EXISTS idx_clusters_final_score ON clusters(final_score);
