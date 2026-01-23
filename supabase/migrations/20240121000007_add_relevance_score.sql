-- Ajout d'un score de pertinence pour filtrer le bruit
alter table articles add column if not exists relevance_score int default null;

-- Index pour récupérer rapidement les articles pertinents
create index if not exists idx_articles_relevance on articles(relevance_score desc nulls last);
