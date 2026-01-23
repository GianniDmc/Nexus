'use client';

import { useState, useRef } from 'react';
import { RefreshCw, Play, Square, AlertCircle, CheckCircle, Clock } from 'lucide-react';

interface ProcessingStats {
    embeddings: number;
    clustered: number;
    scored: number;
    rewritten: number;
}

export function AutoProcessor({ onStatsUpdate }: { onStatsUpdate?: () => void }) {
    const [isRunning, setIsRunning] = useState(false);
    const [log, setLog] = useState<string[]>([]);
    const [stats, setStats] = useState<ProcessingStats>({ embeddings: 0, clustered: 0, scored: 0, rewritten: 0 });
    const [consecutiveErrors, setConsecutiveErrors] = useState(0);
    const abortControllerRef = useRef<AbortController | null>(null);

    const addLog = (msg: string) => {
        setLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 9)]);
    };

    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    const runCycle = async () => {
        if (abortControllerRef.current?.signal.aborted) return false;

        try {
            const res = await fetch('/api/process', {
                signal: abortControllerRef.current?.signal
            });

            if (res.status === 429) {
                const errorData = await res.json().catch(() => ({}));
                const waittime = (errorData.retryAfter ? errorData.retryAfter * 1000 : 0) || (10000 * (consecutiveErrors + 1));

                addLog(`⚠️ Rate Limit (429). Pause ${Math.round(waittime / 1000)}s...`);
                setConsecutiveErrors(prev => prev + 1);
                await sleep(waittime);
                return true;
            }

            if (!res.ok) {
                addLog(`❌ Erreur API: ${res.status}`);
                setConsecutiveErrors(prev => prev + 1);
                await sleep(2000);
                return true; // On réessaie
            }

            const data = await res.json();
            setConsecutiveErrors(0);

            const { embeddings, clustered, scored, rewritten } = data.processed;

            setStats(prev => ({
                embeddings: prev.embeddings + embeddings,
                clustered: prev.clustered + clustered,
                scored: prev.scored + scored,
                rewritten: prev.rewritten + rewritten
            }));

            const totalProcessed = embeddings + clustered + scored + rewritten;

            if (totalProcessed === 0) {
                // If queue is empty, try to fetch new articles
                addLog("📭 File de traitement vide. Tentative d'ingestion...");
                try {
                    const ingestRes = await fetch('/api/ingest');
                    const ingestData = await ingestRes.json();
                    if (ingestData.success && ingestData.articlesIngested > 0) {
                        addLog(`📥 Nouveaux articles récupérés: ${ingestData.articlesIngested}`);
                        await sleep(2000);
                        return true; // Restart processing loop immediately
                    } else {
                        addLog("zzz Aucun nouvel article. Pause 30s...");
                        await sleep(30000);
                    }
                } catch (ingestErr) {
                    addLog("❌ Erreur ingestion. Pause 30s...");
                    await sleep(30000);
                }
                return true;
            }

            addLog(`⚡ Traité: ${totalProcessed} articles (S:${scored} en ${data.processed.batches || 1} lots | R:${rewritten})`);
            if (onStatsUpdate) onStatsUpdate();

            // Petite pause pour laisser respirer le serveur
            await sleep(1000);
            return true;

        } catch (e: any) {
            if (e.name === 'AbortError') {
                addLog("⏹️ Arrêt demandé.");
                return false;
            }
            addLog(`❌ Erreur réseau: ${e.message}`);
            await sleep(5000);
            return true;
        }
    };

    const startAutoPilot = async () => {
        if (isRunning) return;

        setIsRunning(true);
        setLog([]);
        setStats({ embeddings: 0, clustered: 0, scored: 0, rewritten: 0 });
        abortControllerRef.current = new AbortController();

        addLog("🚀 Démarrage du Pilote Automatique");

        let keepGoing = true;
        while (keepGoing && !abortControllerRef.current?.signal.aborted) {
            keepGoing = await runCycle();
        }

        setIsRunning(false);
    };

    const stopAutoPilot = () => {
        abortControllerRef.current?.abort();
        setIsRunning(false);
    };

    return (
        <div className="bg-card border border-border rounded-xl p-6 shadow-xl">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-xl font-bold flex items-center gap-2 text-primary">
                        <RefreshCw className={`w-5 h-5 ${isRunning ? 'animate-spin text-accent' : ''}`} />
                        Smart Processor
                    </h2>
                    <p className="text-xs text-muted mt-1">Orchestration intelligente des batchs avec gestion Rate Limit.</p>
                </div>

                {isRunning ? (
                    <button
                        onClick={stopAutoPilot}
                        className="bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-colors"
                    >
                        <Square className="w-4 h-4 fill-current" /> Stop
                    </button>
                ) : (
                    <button
                        onClick={startAutoPilot}
                        className="bg-accent text-white hover:bg-accent/90 px-6 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all shadow-lg hover:shadow-accent/20"
                    >
                        <Play className="w-4 h-4 fill-current" /> Lancer Auto
                    </button>
                )}
            </div>

            <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="bg-secondary/20 rounded-lg p-3 text-center border border-border/50">
                    <span className="block text-2xl font-serif text-primary">{stats.embeddings}</span>
                    <span className="text-[9px] uppercase tracking-widest text-muted">Vecteurs</span>
                </div>
                <div className="bg-secondary/20 rounded-lg p-3 text-center border border-border/50">
                    <span className="block text-2xl font-serif text-primary">{stats.clustered}</span>
                    <span className="text-[9px] uppercase tracking-widest text-muted">Cluster</span>
                </div>
                <div className="bg-secondary/20 rounded-lg p-3 text-center border border-border/50">
                    <span className="block text-2xl font-serif text-primary">{stats.scored}</span>
                    <span className="text-[9px] uppercase tracking-widest text-muted">Scored</span>
                </div>
                <div className="bg-accent/10 rounded-lg p-3 text-center border border-accent/20">
                    <span className="block text-2xl font-serif text-accent">{stats.rewritten}</span>
                    <span className="text-[9px] uppercase tracking-widest text-accent font-bold">Publiés</span>
                </div>
            </div>

            <div className="bg-black/40 rounded-lg p-4 font-mono text-[10px] text-green-400 h-32 overflow-y-auto space-y-1 custom-scrollbar">
                {log.length === 0 && <span className="text-muted/50 italic">Prêt à démarrer...</span>}
                {log.map((l, i) => (
                    <div key={i} className={l.includes('❌') || l.includes('⚠️') ? 'text-yellow-400' : ''}>
                        {l}
                    </div>
                ))}
            </div>
        </div>
    );
}
