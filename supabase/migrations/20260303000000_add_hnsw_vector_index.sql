-- Index HNSW sur les embeddings pour accélérer find_similar_articles
-- Réduit la latence de recherche vectorielle de O(n) scan séquentiel à ~O(log n)
CREATE INDEX IF NOT EXISTS idx_articles_embedding_hnsw
ON articles USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
