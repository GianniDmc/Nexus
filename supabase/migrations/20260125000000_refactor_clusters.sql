-- Refonte Architecture 2026-01-25
-- Objectif : Séparer strictement Articles (Sources) et Summaries (Contenu Généré)

-- 1. Nettoyage complet (Reset)
-- On vide les tables de contenu, mais on garde la configuration des sources
TRUNCATE TABLE summaries, clusters, articles CASCADE;

-- 2. Enrichissement de la table Summaries (Contenu Généré)
-- Cette table stockera désormais le résultat de la réécriture, au lieu d'écraser l'article original
ALTER TABLE summaries
ADD COLUMN IF NOT EXISTS title text,
ADD COLUMN IF NOT EXISTS content_full text,
ADD COLUMN IF NOT EXISTS image_url text, 
ADD COLUMN IF NOT EXISTS source_count int,
ADD COLUMN IF NOT EXISTS author text; -- Optionnel, pour signer l'IA

-- 3. Enrichissement de la table Clusters
-- Permet d'afficher une image directement depuis le cluster sans joindre
ALTER TABLE clusters
ADD COLUMN IF NOT EXISTS image_url text;

-- Note : La table 'articles' reste inchangée, elle sert de source immuable.
-- Les champs 'final_score' et 'is_published' de 'articles' ne seront plus utilisés pour l'affichage public,
-- mais peuvent servir pour le debugging interne.
