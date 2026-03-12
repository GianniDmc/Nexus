'use client';

import { Fragment, useEffect, useState, useCallback } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  RefreshCw, CheckCircle, XCircle, Loader2, ChevronLeft, ChevronRight,
  Download, Zap, Filter, ChevronDown, ChevronUp,
} from 'lucide-react';

interface PipelineRun {
  id: string;
  type: 'ingest' | 'process';
  step: string | null;
  profile: string | null;
  status: 'running' | 'success' | 'error';
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  result: Record<string, unknown> | null;
  error: string | null;
  trigger: string;
}

const STATUS_CONFIG = {
  running: { icon: Loader2, color: 'text-blue-400', bg: 'bg-blue-500/10', label: 'En cours' },
  success: { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/10', label: 'Succès' },
  error: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10', label: 'Erreur' },
} as const;

const TYPE_CONFIG = {
  ingest: { icon: Download, color: 'text-purple-400', label: 'Ingestion' },
  process: { icon: Zap, color: 'text-accent', label: 'Process' },
} as const;

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m${seconds.toString().padStart(2, '0')}s`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
    + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function ResultBadges({ run }: { run: PipelineRun }) {
  if (!run.result) return null;
  const r = run.result;

  if (run.type === 'ingest') {
    const ingested = (r.articlesIngested as number) ?? 0;
    const failed = (r.failedSources as number) ?? 0;
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 font-mono">
          +{ingested} articles
        </span>
        {failed > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-300 font-mono">
            {failed} sources en erreur
          </span>
        )}
      </div>
    );
  }

  // Process run
  const embeddings = (r.embeddings as number) ?? 0;
  const clustered = (r.clustered as number) ?? 0;
  const scored = (r.scored as number) ?? 0;
  const rewritten = (r.rewritten as number) ?? 0;
  const total = embeddings + clustered + scored + rewritten;

  if (total === 0 && run.status === 'success') {
    return <span className="text-[10px] text-muted italic">Aucun traitement</span>;
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {embeddings > 0 && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-300 font-mono">
          E:{embeddings}
        </span>
      )}
      {clustered > 0 && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 font-mono">
          C:{clustered}
        </span>
      )}
      {scored > 0 && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-300 font-mono">
          S:{scored}
        </span>
      )}
      {rewritten > 0 && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-300 font-mono">
          R:{rewritten}
        </span>
      )}
    </div>
  );
}

function DetailRow({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/20 last:border-b-0">
      <span className="text-xs text-muted">{label}</span>
      <span className={`text-xs font-mono font-medium ${color ?? 'text-primary'}`}>{value}</span>
    </div>
  );
}

function RunDetails({ run }: { run: PipelineRun }) {
  const r = run.result;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {/* Infos générales */}
      <div className="bg-card/50 rounded-lg p-4 border border-border/30">
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted mb-3">Informations</h4>
        <DetailRow label="ID" value={run.id.slice(0, 8) + '...'} />
        <DetailRow label="Type" value={run.type === 'ingest' ? 'Ingestion' : 'Process'} />
        {run.step && <DetailRow label="Étape" value={run.step} />}
        <DetailRow label="Profil" value={run.profile ?? 'par défaut'} />
        <DetailRow label="Déclencheur" value={run.trigger} />
        <DetailRow label="Début" value={formatDateTime(run.started_at)} />
        {run.finished_at && <DetailRow label="Fin" value={formatDateTime(run.finished_at)} />}
        {run.duration_ms != null && (
          <DetailRow label="Durée" value={formatDuration(run.duration_ms)} color="text-accent" />
        )}
      </div>

      {/* Résultats détaillés */}
      {r && run.type === 'process' && (
        <div className="bg-card/50 rounded-lg p-4 border border-border/30">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted mb-3">Traitement</h4>
          <DetailRow
            label="Embeddings générés"
            value={((r.embeddings as number) ?? 0)}
            color={(r.embeddings as number) > 0 ? 'text-blue-400' : undefined}
          />
          <DetailRow
            label="Articles clusterisés"
            value={((r.clustered as number) ?? 0)}
            color={(r.clustered as number) > 0 ? 'text-purple-400' : undefined}
          />
          <DetailRow
            label="Clusters scorés"
            value={((r.scored as number) ?? 0)}
            color={(r.scored as number) > 0 ? 'text-yellow-400' : undefined}
          />
          <DetailRow
            label="Clusters réécrits / publiés"
            value={((r.rewritten as number) ?? 0)}
            color={(r.rewritten as number) > 0 ? 'text-green-400' : undefined}
          />
          <DetailRow label="Batchs exécutés" value={((r.batches as number) ?? 0)} />
          {!!r.stopped && <DetailRow label="Arrêté prématurément" value="Oui" color="text-amber-400" />}
          {!!r.timeBudgetReached && <DetailRow label="Budget temps atteint" value="Oui" color="text-amber-400" />}
        </div>
      )}

      {r && run.type === 'ingest' && (
        <div className="bg-card/50 rounded-lg p-4 border border-border/30">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted mb-3">Ingestion</h4>
          <DetailRow
            label="Articles ingérés"
            value={((r.articlesIngested as number) ?? 0)}
            color={(r.articlesIngested as number) > 0 ? 'text-purple-400' : undefined}
          />
          <DetailRow
            label="Sources en erreur"
            value={((r.failedSources as number) ?? 0)}
            color={(r.failedSources as number) > 0 ? 'text-red-400' : undefined}
          />
          {typeof r.sourceFilter === 'string' && (
            <DetailRow label="Filtre source" value={r.sourceFilter} />
          )}
        </div>
      )}

      {/* Message d'erreur complet */}
      {run.error && (
        <div className="bg-red-500/5 rounded-lg p-4 border border-red-500/20 md:col-span-2 lg:col-span-1">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-red-400 mb-3">Erreur</h4>
          <p className="text-xs text-red-300 font-mono whitespace-pre-wrap break-all leading-relaxed">
            {run.error}
          </p>
        </div>
      )}
    </div>
  );
}

export function PipelineRunsLog() {
  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [typeFilter, setTypeFilter] = useState<'all' | 'ingest' | 'process'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const PAGE_SIZE = 25;

  const fetchRuns = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
      });
      if (typeFilter !== 'all') {
        params.set('type', typeFilter);
      }
      const res = await fetch(`/api/admin/pipeline-runs?${params}`);
      const data = await res.json();
      setRuns(data.runs ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      console.error('Erreur chargement pipeline runs', e);
    } finally {
      setLoading(false);
    }
  }, [page, typeFilter]);

  useEffect(() => {
    fetchRuns();
    const interval = setInterval(fetchRuns, 15000);
    return () => clearInterval(interval);
  }, [fetchRuns]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Statistiques rapides
  const successCount = runs.filter(r => r.status === 'success').length;
  const errorCount = runs.filter(r => r.status === 'error').length;
  const runningCount = runs.filter(r => r.status === 'running').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-serif font-medium text-primary flex items-center gap-2">
            <Zap className="w-5 h-5 text-accent" /> Historique Pipeline
          </h2>
          <p className="text-sm text-muted mt-1">
            Journal de toutes les exécutions du pipeline (ingestion + traitement).
          </p>
        </div>
        <button
          onClick={fetchRuns}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-secondary/50 hover:bg-secondary rounded-lg text-sm transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </button>
      </div>

      {/* Stats rapides + filtre */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3 text-xs">
          <span className="text-muted">{total} exécutions au total</span>
          {runningCount > 0 && (
            <span className="flex items-center gap-1 text-blue-400">
              <Loader2 className="w-3 h-3 animate-spin" /> {runningCount} en cours
            </span>
          )}
          <span className="flex items-center gap-1 text-green-400">
            <CheckCircle className="w-3 h-3" /> {successCount}
          </span>
          <span className="flex items-center gap-1 text-red-400">
            <XCircle className="w-3 h-3" /> {errorCount}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-muted" />
          {(['all', 'ingest', 'process'] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTypeFilter(t); setPage(0); }}
              className={`text-xs px-3 py-1 rounded-full transition-colors ${
                typeFilter === t
                  ? 'bg-accent/20 text-accent'
                  : 'bg-secondary/50 text-muted hover:bg-secondary'
              }`}
            >
              {t === 'all' ? 'Tout' : t === 'ingest' ? 'Ingestion' : 'Process'}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 text-xs text-muted uppercase tracking-wider">
                <th className="text-left py-3 px-4">Status</th>
                <th className="text-left py-3 px-4">Type</th>
                <th className="text-left py-3 px-4 hidden md:table-cell">Profil</th>
                <th className="text-left py-3 px-4">Début</th>
                <th className="text-left py-3 px-4 hidden sm:table-cell">Durée</th>
                <th className="text-left py-3 px-4">Résultats</th>
              </tr>
            </thead>
            <tbody>
              {loading && runs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-muted">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Chargement...
                  </td>
                </tr>
              ) : runs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-muted">
                    Aucune exécution enregistrée.
                  </td>
                </tr>
              ) : (
                runs.map((run) => {
                  const statusCfg = STATUS_CONFIG[run.status];
                  const typeCfg = TYPE_CONFIG[run.type];
                  const StatusIcon = statusCfg.icon;
                  const TypeIcon = typeCfg.icon;
                  const isExpanded = expandedId === run.id;

                  return (
                    <Fragment key={run.id}>
                      <tr
                        onClick={() => setExpandedId(isExpanded ? null : run.id)}
                        className={`border-b border-border/30 cursor-pointer transition-colors ${
                          isExpanded ? 'bg-secondary/20' : 'hover:bg-secondary/10'
                        } ${run.status === 'error' ? 'bg-red-500/5' : ''}`}
                      >
                        {/* Status */}
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${statusCfg.color}`}>
                            <StatusIcon className={`w-3.5 h-3.5 ${run.status === 'running' ? 'animate-spin' : ''}`} />
                            <span className="hidden sm:inline">{statusCfg.label}</span>
                          </span>
                        </td>

                        {/* Type + Step */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            <TypeIcon className={`w-3.5 h-3.5 ${typeCfg.color}`} />
                            <span className="text-xs font-medium">{typeCfg.label}</span>
                            {run.step && run.step !== 'all' && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary/50 text-muted">
                                {run.step}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Profil */}
                        <td className="py-3 px-4 hidden md:table-cell">
                          <span className="text-xs text-muted font-mono">{run.profile ?? '-'}</span>
                        </td>

                        {/* Date */}
                        <td className="py-3 px-4">
                          <div className="text-xs">
                            <div className="font-mono">{formatDateTime(run.started_at)}</div>
                            <div className="text-muted text-[10px]">
                              {formatDistanceToNow(new Date(run.started_at), { addSuffix: true, locale: fr })}
                            </div>
                          </div>
                        </td>

                        {/* Durée */}
                        <td className="py-3 px-4 hidden sm:table-cell">
                          <span className="text-xs font-mono text-muted">
                            {run.duration_ms != null ? formatDuration(run.duration_ms) : '-'}
                          </span>
                        </td>

                        {/* Résultats + chevron */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div className="flex-1">
                              {run.error ? (
                                <span className="text-[10px] text-red-400 truncate block max-w-[200px]" title={run.error}>
                                  {run.error}
                                </span>
                              ) : (
                                <ResultBadges run={run} />
                              )}
                            </div>
                            {(run.result || run.error) && (
                              isExpanded
                                ? <ChevronUp className="w-3.5 h-3.5 text-muted flex-shrink-0" />
                                : <ChevronDown className="w-3.5 h-3.5 text-muted flex-shrink-0" />
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Panneau de détails déplié */}
                      {isExpanded && (
                        <tr className="bg-secondary/10">
                          <td colSpan={6} className="px-4 py-4">
                            <RunDetails run={run} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border/50">
            <span className="text-xs text-muted">
              Page {page + 1} / {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1.5 rounded hover:bg-secondary/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-1.5 rounded hover:bg-secondary/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
