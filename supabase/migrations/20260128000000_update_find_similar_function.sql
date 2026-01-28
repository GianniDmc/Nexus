-- Add published_at and source_name to finding similar articles
DROP FUNCTION IF EXISTS find_similar_articles(vector, float, int, timestamptz, int, uuid);

CREATE OR REPLACE FUNCTION find_similar_articles(
    query_embedding vector(1536),
    match_threshold float,
    match_count int,
    anchor_date timestamptz,   -- The date of the article we are clustering
    window_days int,           -- Look +/- X days around this date
    exclude_id uuid default null
)
RETURNS TABLE (
    id uuid,
    title text,
    similarity float,
    cluster_id uuid,
    published_at timestamptz,
    source_name text
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        articles.id,
        articles.title,
        1 - (articles.embedding <=> query_embedding) AS similarity,
        articles.cluster_id,
        articles.published_at,
        articles.source_name
    FROM articles
    WHERE 
        -- Time Window: +/- window_days around the anchor date
        articles.published_at >= (anchor_date - (window_days || ' days')::interval)
        AND articles.published_at <= (anchor_date + (window_days || ' days')::interval)
        
        -- Vector Similarity
        AND 1 - (articles.embedding <=> query_embedding) > match_threshold
        
        -- Self Exclusion
        AND (exclude_id IS NULL OR articles.id != exclude_id)
    ORDER BY articles.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
