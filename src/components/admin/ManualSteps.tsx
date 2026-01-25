'use client';

import { useState, useRef, useEffect } from 'react';
import { Database, GitBranch, Star, PenTool, RefreshCw, Square, CheckCircle, AlertCircle, Infinity, Rss, ChevronDown, ChevronUp } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { PUBLICATION_RULES } from '@/lib/publication-rules';

type Step = 'embedding' | 'clustering' | 'scoring' | 'rewriting';

interface StepConfig {
    id: Step;
    label: string;
    icon: React.ReactNode;
    description: string;
    color: string;
    statKey: string;
}

const STEPS: StepConfig[] = [
    { id: 'embedding', label: 'Embeddings', icon: <Database className="w-4 h-4" />, description: 'Vectorisation', color: 'text-blue-500', statKey: 'pendingEmbedding' },
    { id: 'clustering', label: 'Clustering', icon: <GitBranch className="w-4 h-4" />, description: 'Regroupement', color: 'text-purple-500', statKey: 'pendingClustering' },
    { id: 'scoring', label: 'Scoring', icon: <Star className="w-4 h-4" />, description: 'Évaluation', color: 'text-yellow-500', statKey: 'pendingScoring' },
    { id: 'rewriting', label: 'Rédaction', icon: <PenTool className="w-4 h-4" />, description: 'Publication', color: 'text-green-500', statKey: 'pendingRewriting' },
];

interface Source {
    id: string;
    name: string;
    url: string;
    category: string;
    isActive: boolean;
    lastFetchedAt: string | null;
    articleCount: number;
}

interface PipelineStats {
    pendingEmbedding?: number;
    pendingClustering?: number;
    pendingScoring?: number;
    pendingRewriting?: number;
}

export function ManualSteps({ onComplete }: { onComplete?: () => void }) {
    const [runningStep, setRunningStep] = useState<Step | null>(null);
    const [isLooping, setIsLooping] = useState(false);
    const [freshOnly, setFreshOnly] = useState<boolean>(PUBLICATION_RULES.FRESH_ONLY_DEFAULT); // Aligned with config
    const [minSources, setMinSources] = useState<number>(PUBLICATION_RULES.MIN_SOURCES); // Aligned with config
    const [progress, setProgress] = useState<{ step: Step; total: number; current: number } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [stats, setStats] = useState<PipelineStats>({});
    const [sources, setSources] = useState<Source[]>([]);
    const [showSources, setShowSources] = useState(false);
    const [ingestingSource, setIngestingSource] = useState<string | null>(null);
    const [ingestResult, setIngestResult] = useState<{ source: string; count: number } | null>(null);
    const [serverRunning, setServerRunning] = useState<{
        isRunning: boolean;
        step: string | null;
        progress?: { current: number; total: number; label?: string };
    }>({ isRunning: false, step: null });
    const abortControllerRef = useRef<AbortController | null>(null);

    const sleep = (ms: number) => new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, ms);
        abortControllerRef.current?.signal.addEventListener('abort', () => {
            clearTimeout(timeout);
            resolve();
        });
    });

    const fetchStats = async () => {
        try {
            const res = await fetch(`/api/admin/stats?freshOnly=${freshOnly}&minSources=${minSources}`);
            const data = await res.json();
            setStats(data);
        } catch (e) { console.error('Stats fetch failed', e); }
    };



    const fetchSources = async () => {
        try {
            const res = await fetch('/api/admin/sources');
            const data = await res.json();
            setSources(data.sources || []);
        } catch (e) { console.error('Sources fetch failed', e); }
    };

    const fetchServerState = async () => {
        try {
            const res = await fetch('/api/admin/processing-state', {
                headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
            });
            const data = await res.json();
            setServerRunning({
                isRunning: data.isRunning,
                step: data.step,
                progress: data.progress // Sync progress from server
            });
        } catch (e) { console.error('Server state fetch failed', e); }
    };

    // Refresh stats when filters change
    useEffect(() => {
        fetchStats();
    }, [freshOnly, minSources]);

    // Polling Interval (Depends on filters)
    useEffect(() => {
        fetchStats();
        fetchSources();
        fetchServerState();
        const interval = setInterval(() => {
            fetchStats();
            fetchServerState();
        }, 5000);
        return () => clearInterval(interval);
    }, [freshOnly, minSources]);

    const getStepKey = (step: Step) => {
        switch (step) {
            case 'embedding': return 'embeddings';
            case 'clustering': return 'clustered';
            case 'scoring': return 'scored';
            case 'rewriting': return 'rewritten';
        }
    };

    const getAIConfig = () => {
        try {
            const stored = localStorage.getItem('nexus-ai-config');
            return stored ? JSON.parse(stored) : undefined;
        } catch (e) { return undefined; }
    };

    const runOnce = async (step: Step) => {
        if (runningStep) return;
        setRunningStep(step);
        setError(null);
        setProgress(null);

        try {
            const res = await fetch(`/api/process?step=${step}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    step, config: getAIConfig(),
                    freshOnly: freshOnly, // Pass option to backend
                    minSources: minSources
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erreur');
            const count = data.processed[getStepKey(step)] || 0;
            setProgress({ step, total: count, current: count });
            fetchStats();
            if (onComplete) onComplete();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setRunningStep(null);
        }
    };

    const runAll = async (step: Step) => {
        if (runningStep) return;
        setRunningStep(step);
        setIsLooping(true);
        setError(null);
        abortControllerRef.current = new AbortController();
        let totalProcessed = 0;

        try {
            while (!abortControllerRef.current?.signal.aborted) {
                const res = await fetch(`/api/process?step=${step}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ step, config: getAIConfig(), freshOnly: freshOnly, minSources: minSources }),
                    signal: abortControllerRef.current?.signal
                });
                const data = await res.json();
                if (!res.ok) {
                    if (res.status === 429) {
                        setProgress({ step, total: totalProcessed, current: -1 });
                        await sleep(10000);
                        if (abortControllerRef.current?.signal.aborted) break;
                        continue;
                    }
                    throw new Error(data.error || 'Erreur');
                }

                // Check if server signaled to stop
                if (data.processed?.stopped) {
                    break;
                }

                const count = data.processed[getStepKey(step)] || 0;
                totalProcessed += count;
                setProgress({ step, total: totalProcessed, current: count });
                fetchStats();
                if (onComplete) onComplete();
                if (count === 0) break;
                await sleep(500);
                if (abortControllerRef.current?.signal.aborted) break;
            }
        } catch (err: any) {
            if (err.name !== 'AbortError') {
                setError(err.message);
            }
        } finally {
            setRunningStep(null);
            setIsLooping(false);
        }
    };

    const ingestSource = async (sourceName?: string) => {
        setIngestingSource(sourceName || 'all');
        setError(null);
        setIngestResult(null);
        try {
            const url = sourceName ? `/api/ingest?source=${encodeURIComponent(sourceName)}` : '/api/ingest';
            const res = await fetch(url);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erreur');
            setIngestResult({ source: sourceName || 'Toutes sources', count: data.articlesIngested || 0 });
            fetchSources();
            fetchStats();
            if (onComplete) onComplete();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIngestingSource(null);
        }
    };

    const stopLoop = async (force: boolean = false) => {
        abortControllerRef.current?.abort();
        // Also notify server to stop (or reset if forced)
        try {
            await fetch('/api/admin/processing-state', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
                body: JSON.stringify({ action: force ? 'reset' : 'stop' })
            });

            if (force) {
                // Force sync after small delay to let DB update
                setTimeout(fetchServerState, 500);
                setTimeout(fetchServerState, 2000);
            } else {
                fetchServerState();
            }
        } catch (e) { console.error('Failed to stop server processing', e); }
    };


    return (
        <div className="bg-card border border-border rounded-xl p-6 space-y-6">
            {/* Ingestion Section */}
            <div>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold flex items-center gap-2">
                        <Rss className="w-4 h-4 text-orange-500" /> Ingestion
                    </h3>
                    <div className="flex gap-2">
                        <button
                            onClick={() => ingestSource()}
                            disabled={!!ingestingSource}
                            className="text-xs bg-orange-500/20 text-orange-500 px-3 py-1 rounded-full hover:bg-orange-500 hover:text-white transition-colors disabled:opacity-50 flex items-center gap-1"
                        >
                            {ingestingSource === 'all' ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Rss className="w-3 h-3" />}
                            Toutes les sources
                        </button>
                        <button
                            onClick={() => setShowSources(!showSources)}
                            className="text-xs text-muted hover:text-primary transition-colors flex items-center gap-1"
                        >
                            {showSources ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            Par source
                        </button>
                    </div>
                </div>

                {showSources && (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
                        {sources.filter(s => s.isActive).map(source => (
                            <button
                                key={source.id}
                                onClick={() => ingestSource(source.name)}
                                disabled={!!ingestingSource}
                                className="text-left p-3 rounded-lg border border-border hover:border-orange-500/50 hover:bg-secondary/50 transition-all disabled:opacity-50"
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-bold truncate">{source.name}</span>
                                    {ingestingSource === source.name && <RefreshCw className="w-3 h-3 animate-spin text-orange-500" />}
                                </div>
                                <div className="text-[10px] text-muted">
                                    {source.articleCount} articles
                                    {source.lastFetchedAt && (
                                        <span className="ml-2">• {formatDistanceToNow(new Date(source.lastFetchedAt), { addSuffix: true, locale: fr })}</span>
                                    )}
                                </div>
                            </button>
                        ))}
                    </div>
                )}

                {/* Ingestion Result */}
                {ingestResult && (
                    <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg text-orange-500 text-xs flex items-center justify-between">
                        <span className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4" />
                            <strong>{ingestResult.source}</strong>: {ingestResult.count} articles ajoutés
                        </span>
                        <button onClick={() => setIngestResult(null)} className="text-muted hover:text-primary">✕</button>
                    </div>
                )}
            </div>

            <div className="w-full h-px bg-border" />

            {/* Processing Steps */}
            <div>
                <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-accent" /> Traitement
                </h3>

                {/* Global Options */}
                <div className="mb-4 flex flex-wrap gap-4 items-center">
                    <label className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/30 px-3 py-2 rounded-lg border border-border/50 cursor-pointer hover:bg-secondary/50 transition-colors w-fit">
                        <input
                            type="checkbox"
                            checked={freshOnly}
                            onChange={(e) => setFreshOnly(e.target.checked)}
                            className="rounded border-gray-400 text-accent focus:ring-accent w-4 h-4"
                        />
                        <span>Uniquement articles &lt; 48h (Économie IA)</span>
                    </label>

                    <div className="flex items-center gap-3 text-xs text-muted-foreground bg-secondary/30 px-4 py-2 rounded-lg border border-border/50">
                        <GitBranch className="w-3 h-3 text-purple-500" />
                        <span className="font-semibold">Consensus :</span>
                        <div className="flex items-center gap-2">
                            <input
                                type="range"
                                min="1"
                                max="5"
                                step="1"
                                value={minSources}
                                onChange={(e) => setMinSources(parseInt(e.target.value))}
                                className="w-24 h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-purple-500"
                            />
                            <span className="font-mono font-bold text-foreground w-3">{minSources}</span>
                            <span className="text-[10px] text-muted">{minSources > 1 ? 'sources min.' : 'source min.'}</span>
                        </div>
                    </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {STEPS.map((step) => {
                        const remaining = (stats as any)[step.statKey] || 0;
                        return (
                            <div key={step.id} className="relative">
                                <button
                                    onClick={() => runOnce(step.id)}
                                    disabled={runningStep !== null || serverRunning.isRunning}
                                    className={`w-full p-3 rounded-xl border transition-all ${runningStep === step.id ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/50'} disabled:opacity-50 flex flex-col items-center gap-1 text-center`}
                                >
                                    <div className={`${step.color} ${runningStep === step.id ? 'animate-pulse' : ''}`}>
                                        {runningStep === step.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : step.icon}
                                    </div>
                                    <span className="text-xs font-bold">{step.label}</span>
                                    <span className={`text-lg font-mono ${remaining > 0 ? step.color : 'text-muted'}`}>{remaining}</span>
                                </button>
                                {remaining > 0 && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); runAll(step.id); }}
                                        disabled={runningStep !== null || serverRunning.isRunning}
                                        title="Tout traiter"
                                        className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-accent text-white flex items-center justify-center hover:bg-accent/80 transition-all shadow-lg disabled:opacity-50"
                                    >
                                        <Infinity className="w-3 h-3" />
                                    </button>
                                )}
                                {remaining === 0 && (
                                    <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-green-500 text-white flex items-center justify-center">
                                        <CheckCircle className="w-3 h-3" />
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Progress / Error Display */}
            {(isLooping || serverRunning.isRunning) && (
                <div className="p-4 bg-secondary/30 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold flex items-center gap-2">
                            <RefreshCw className="w-4 h-4 animate-spin text-accent" />
                            {isLooping && progress
                                ? STEPS.find(s => s.id === progress.step)?.label
                                : serverRunning.step
                                    ? STEPS.find(s => s.id === serverRunning.step)?.label || serverRunning.step
                                    : 'Traitement en cours'}...
                        </span>
                        {/* Stop Button */}
                        <div className="flex gap-2">
                            <button
                                onClick={() => stopLoop(!isLooping && !runningStep && serverRunning.isRunning)}
                                className="text-xs bg-red-500/20 text-red-500 px-3 py-1 rounded-full hover:bg-red-500 hover:text-white transition-colors flex items-center gap-1"
                            >
                                <Square className="w-3 h-3 fill-current" />
                                {!isLooping && !runningStep && serverRunning.isRunning ? 'Forcer arrêt' : 'Stop'}
                            </button>
                        </div>
                    </div>
                    <div className="text-2xl font-mono text-accent text-center mt-2">
                        {!isLooping && !runningStep && serverRunning.isRunning
                            ? <div className="space-y-2">
                                <span className="text-yellow-500 text-sm font-bold block">⚠️ Processus actif (autre session)</span>
                                {serverRunning.progress && (
                                    <div className="text-xs text-muted font-normal">
                                        <div className="flex justify-between mb-1">
                                            <span>{serverRunning.progress.label}</span>
                                            <span>{Math.round((serverRunning.progress.current / serverRunning.progress.total) * 100)}%</span>
                                        </div>
                                        <div className="w-full bg-black/20 h-1.5 rounded-full overflow-hidden">
                                            <div
                                                className="bg-accent h-full transition-all duration-500"
                                                style={{ width: `${(serverRunning.progress.current / serverRunning.progress.total) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                            : !progress
                                ? serverRunning.progress && (runningStep === serverRunning.step)
                                    ? <div className="text-sm">
                                        <p className="mb-2 text-accent animate-pulse">{serverRunning.progress.label}</p>
                                        <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                                            <div
                                                className="bg-accent h-full transition-all duration-300"
                                                style={{ width: `${(serverRunning.progress.current / serverRunning.progress.total) * 100}%` }}
                                            />
                                        </div>
                                        <p className="mt-1 text-xs text-muted">{serverRunning.progress.current} / {serverRunning.progress.total}</p>
                                    </div>
                                    : <span className="text-accent animate-pulse">Traitement en cours...</span>
                                : progress.current === -1
                                    ? <span className="text-yellow-500">⏳ Rate Limit...</span>
                                    : <>{progress.total} traités</>}
                    </div>
                </div>
            )}

            {error && !isLooping && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-500 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" /> {error}
                </div>
            )}
        </div>
    );
}
