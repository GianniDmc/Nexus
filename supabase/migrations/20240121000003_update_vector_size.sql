-- On change la taille du vecteur pour le modèle gratuit (384 au lieu de 1536)
alter table articles drop column if exists embedding;
alter table articles add column embedding vector(384);

-- On met à jour la fonction de recherche pour qu'elle accepte le nouveau format
create or replace function find_similar_articles(
    query_embedding vector(384),
    match_threshold float,
    match_count int,
    lookback_days int
)
returns table (
    id uuid,
    title text,
    similarity float,
    cluster_id uuid
)
language plpgsql
as $$
begin
    return query
    select
        articles.id,
        articles.title,
        1 - (articles.embedding <=> query_embedding) as similarity,
        articles.cluster_id
    from articles
    where 
        articles.published_at > now() - (lookback_days || ' days')::interval
        and 1 - (articles.embedding <=> query_embedding) > match_threshold
    order by articles.embedding <=> query_embedding
    limit match_count;
end;
$$;
