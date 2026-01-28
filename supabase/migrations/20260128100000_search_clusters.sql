-- Helper to search, filter and paginate clusters efficiently
-- Includes Article Count and Sorting
DROP FUNCTION IF EXISTS search_clusters(text, text, int, int);

CREATE OR REPLACE FUNCTION search_clusters(
    search_query text DEFAULT NULL,
    filter_status text DEFAULT 'all',  -- 'all', 'published', 'unpublished', 'important'
    sort_by text DEFAULT 'date_desc',  -- 'date_desc', 'score_desc', 'count_desc'
    limit_val int DEFAULT 20,
    offset_val int DEFAULT 0
)
RETURNS TABLE (
    id uuid,
    label text,
    is_published boolean,
    final_score double precision,
    created_at timestamptz,
    article_count bigint,
    total_count bigint
) AS $$
BEGIN
    RETURN QUERY
    WITH filtered_clusters AS (
        SELECT 
            c.id,
            c.label,
            c.is_published,
            c.final_score,
            c.created_at,
            (SELECT COUNT(*) FROM articles a WHERE a.cluster_id = c.id) as article_cnt
        FROM clusters c
        WHERE 
            -- Search Filter
            (search_query IS NULL OR c.label ILIKE '%' || search_query || '%')
            
            -- Status Filter
            AND (
                filter_status = 'all'
                OR (filter_status = 'published' AND c.is_published = true)
                OR (filter_status = 'unpublished' AND c.is_published = false)
                OR (filter_status = 'important' AND c.final_score >= 7.0)
            )
            
            -- Filter out empty clusters
            AND (SELECT COUNT(*) FROM articles a WHERE a.cluster_id = c.id) > 0
    ),
    total AS (
        SELECT COUNT(*) as tot FROM filtered_clusters
    )
    SELECT 
        fc.id,
        fc.label,
        fc.is_published,
        fc.final_score,
        fc.created_at,
        fc.article_cnt as article_count,
        (SELECT tot FROM total) as total_count
    FROM filtered_clusters fc
    ORDER BY 
        CASE WHEN sort_by = 'date_desc' THEN fc.created_at END DESC,
        CASE WHEN sort_by = 'score_desc' THEN fc.final_score END DESC NULLS LAST,
        CASE WHEN sort_by = 'count_desc' THEN fc.article_cnt END DESC,
        -- Secondary sorts for consistency
        fc.created_at DESC
    LIMIT limit_val OFFSET offset_val;
END;
$$ LANGUAGE plpgsql;
