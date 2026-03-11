-- Activer RLS sur les tables sensibles signalées par les alertes Supabase
ALTER TABLE public.app_state ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.clusters ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.summaries ENABLE ROW LEVEL SECURITY;

-- POLITIQUE POUR app_state
-- Aucune politique créée sciemment pour le rôle public.
-- Toutes les requêtes (anon/authenticated) seront rejetées.
-- Seul le 'service_role' (backend) bypassera cette restriction.

-- POLITIQUES DE LECTURE (SELECT) PUBLIQUE
-- Permet à tout visiteur (via Anon Key) de lire les contenus depuis le client (NewsFeed)

CREATE POLICY "Allow public read access on articles" ON public.articles FOR
SELECT USING (true);

CREATE POLICY "Allow public read access on clusters" ON public.clusters FOR
SELECT USING (true);

CREATE POLICY "Allow public read access on sources" ON public.sources FOR
SELECT USING (true);

CREATE POLICY "Allow public read access on summaries" ON public.summaries FOR
SELECT USING (true);