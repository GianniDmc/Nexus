-- Exclure les articles de clusters publiés de la recherche de similarité.
-- Empêche les nouveaux articles d'être absorbés par des clusters déjà publiés,
-- ce qui forçait des événements distincts (ex: "YggTorrent ferme" vs "YggTorrent rouvre")
-- à fusionner dans le même cluster.
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
        a.id,
        a.title,
        1 - (a.embedding <=> query_embedding) AS similarity,
        a.cluster_id,
        a.published_at,
        a.source_name
    FROM articles a
    LEFT JOIN clusters c ON c.id = a.cluster_id
    WHERE
        -- Time Window: +/- window_days around the anchor date
        a.published_at >= (anchor_date - (window_days || ' days')::interval)
        AND a.published_at <= (anchor_date + (window_days || ' days')::interval)

        -- Vector Similarity
        AND 1 - (a.embedding <=> query_embedding) > match_threshold

        -- Self Exclusion
        AND (exclude_id IS NULL OR a.id != exclude_id)

        -- Exclure les articles appartenant à des clusters déjà publiés
        AND (a.cluster_id IS NULL OR c.is_published = false)
    ORDER BY a.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
