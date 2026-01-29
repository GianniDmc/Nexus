-- Fonction optimisée pour récupérer les stats par source
create or replace function get_source_stats()
returns table (source_name text, article_count bigint)
language sql
as $$
  select source_name, count(*) as article_count
  from articles
  group by source_name;
$$;
