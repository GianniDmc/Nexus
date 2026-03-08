-- Suppression de final_score sur articles (jamais écrit, seul clusters.final_score est utilisé)
ALTER TABLE articles DROP COLUMN IF EXISTS final_score;
