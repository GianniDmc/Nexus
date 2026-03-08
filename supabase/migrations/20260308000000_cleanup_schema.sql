-- Nettoyage du schéma : suppression des tables et colonnes inutilisées

-- Tables inutilisées
DROP TABLE IF EXISTS reading_list;
DROP TABLE IF EXISTS digests;

-- Colonnes inutilisées sur articles
ALTER TABLE articles DROP COLUMN IF EXISTS relevance_score;
ALTER TABLE articles DROP COLUMN IF EXISTS is_published;
ALTER TABLE articles DROP COLUMN IF EXISTS published_on;
ALTER TABLE articles DROP COLUMN IF EXISTS metadata;

-- Colonne inutilisée sur summaries
ALTER TABLE summaries DROP COLUMN IF EXISTS author;
