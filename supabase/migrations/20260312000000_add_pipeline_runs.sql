-- Table pour persister l'historique des exécutions du pipeline
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('ingest', 'process')),
  step text,
  profile text,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'error')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  result jsonb,
  error text,
  trigger text DEFAULT 'api' CHECK (trigger IN ('auto', 'manual', 'cron', 'api')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index pour les requêtes fréquentes (tri par date, filtrage par type/status)
CREATE INDEX idx_pipeline_runs_started_at ON pipeline_runs (started_at DESC);
CREATE INDEX idx_pipeline_runs_type_status ON pipeline_runs (type, status);

-- RLS : accès complet via service role uniquement
ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;
