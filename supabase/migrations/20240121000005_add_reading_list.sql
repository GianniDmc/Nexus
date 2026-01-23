-- Table pour la liste de lecture (Reading List)
-- Note: Pour l'instant, on lie au device (localStorage) ou à un utilisateur anonyme si besoin.
-- Mais pour la structure, on prépare la table.
create table if not exists reading_list (
    id uuid primary key default gen_random_uuid(),
    article_id uuid references articles(id) on delete cascade,
    user_id uuid, -- Pour une future authentification Supabase
    created_at timestamptz default now(),
    unique(article_id, user_id)
);
