'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, Database, CheckCircle, AlertCircle, Layers, Filter, ThumbsUp, ThumbsDown, PenTool, Zap, LayoutDashboard, FileText } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { AutoProcessor } from '@/components/admin/AutoProcessor';
import { ArticleManager } from '@/components/admin/ArticleManager';

export default function AdminPage() {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'editorial'>('dashboard');

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/admin/stats');
      const data = await res.json();
      setStats(data);
    } catch (e) {
      console.error("Erreur stats", e);
    }
  };

  useEffect(() => {
    fetchStats();
    // Refresh stats only when in dashboard mode to save resources, or keep it running? 
    // Let's keep it simple.
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  const progress = stats?.total ? Math.round(((stats.published || 0) / stats.total) * 100) : 0;

  return (
    <div className="min-h-screen bg-background p-8 md:p-16">
      <div className="max-w-6xl mx-auto">
        <header className="mb-12">
          <h1 className="text-3xl font-serif mb-4 flex items-center gap-3 text-primary">
            <Database className="text-accent" /> Salle de Rédaction Nexus
          </h1>
          <div className="flex items-center gap-6 border-b border-border/40">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`pb-3 text-sm font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'dashboard' ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-primary'
                }`}
            >
              <LayoutDashboard className="w-4 h-4" /> Pilotage Auto
            </button>
            <button
              onClick={() => setActiveTab('editorial')}
              className={`pb-3 text-sm font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'editorial' ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-primary'
                }`}
            >
              <FileText className="w-4 h-4" /> Éditorial (CMS)
            </button>
          </div>
        </header>

        {activeTab === 'dashboard' ? (
          <>
            <p className="text-muted mb-12">Vue d'ensemble du pipeline de curation automatisé.</p>

            {/* Pipeline Visualization */}
            <div className="relative mb-16">
              {/* Connecting Line */}
              <div className="absolute top-1/2 left-0 w-full h-1 bg-border/50 -z-10 transform -translate-y-1/2 hidden md:block" />

              <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                {/* Step 1: Ingestion */}
                <div className="bg-card border border-border p-6 rounded-xl shadow-lg relative">
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-2 text-muted">
                    <Database className="w-6 h-6" />
                  </div>
                  <h3 className="text-center font-bold text-sm uppercase tracking-widest mb-4 mt-2">1. Ingestion</h3>
                  <div className="text-center">
                    <span className="text-3xl font-serif block mb-1">{stats?.total || 0}</span>
                    <span className="text-xs text-muted">Articles scannés</span>
                    {stats?.lastSync && (
                      <div className="mt-4 pt-4 border-t border-border/50 text-[10px] text-muted">
                        Dernière synchro : <br />
                        <span className="font-mono text-foreground">{formatDistanceToNow(new Date(stats?.lastSync), { addSuffix: true, locale: fr })}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Step 2: AI Processing */}
                <div className="bg-card border border-border p-6 rounded-xl shadow-lg relative">
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-2 text-accent">
                    <Zap className="w-6 h-6" />
                  </div>
                  <h3 className="text-center font-bold text-sm uppercase tracking-widest text-accent mb-4 mt-2">2. Traitement IA</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center">
                      <span className="text-xl font-serif block text-blue-400">{stats?.pendingScore || 0}</span>
                      <span className="text-[10px] text-muted uppercase">À Scorer</span>
                    </div>
                    <div className="text-center">
                      <span className="text-xl font-serif block text-purple-400">{stats?.scored || 0}</span>
                      <span className="text-[10px] text-muted uppercase">Scorés</span>
                    </div>
                  </div>
                </div>

                {/* Step 3: Validation (Result of AI) */}
                <div className="bg-card border border-border p-6 rounded-xl shadow-lg relative">
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-2 text-primary">
                    <Filter className="w-6 h-6" />
                  </div>
                  <h3 className="text-center font-bold text-sm uppercase tracking-widest mb-4 mt-2">3. Filtrage</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="flex items-center gap-1 text-green-500"><ThumbsUp className="w-3 h-3" /> Pertinents</span>
                      <span className="font-bold">{stats?.relevant || 0}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="flex items-center gap-1 text-red-500"><ThumbsDown className="w-3 h-3" /> Rejetés</span>
                      <span className="font-bold text-muted">{stats?.rejected || 0}</span>
                    </div>
                    <div className="w-full h-px bg-border my-2" />
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-accent font-bold">À Rédiger (Actionnable)</span>
                      <span className="text-accent font-bold text-lg">{stats?.pendingActionable || 0}</span>
                    </div>
                    {stats?.pendingSkipped > 0 && (
                      <div className="flex justify-between items-center text-[10px] text-muted">
                        <span>(Doublons ignorés)</span>
                        <span>{stats?.pendingSkipped}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-blue-500 font-bold">Prêts (En attente)</span>
                      <span className="text-blue-500 font-bold">{stats?.ready || 0}</span>
                    </div>
                  </div>
                </div>

                {/* Step 4: Diffusion */}
                <div className="bg-card border-2 border-accent/20 p-6 rounded-xl shadow-lg relative bg-accent/5">
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-2 text-accent">
                    <Layers className="w-6 h-6" />
                  </div>
                  <h3 className="text-center font-bold text-sm uppercase tracking-widest text-accent mb-4 mt-2">4. Diffusion</h3>
                  <div className="text-center">
                    <span className="text-4xl font-serif block mb-1 text-accent">{stats?.published || 0}</span>
                    <span className="text-xs text-accent/70 font-bold uppercase">Articles Publiés</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              <div className="zen-card bg-card border-border p-8">
                <h2 className="text-xl font-medium mb-4 flex items-center gap-2">
                  <Zap className="w-5 h-5 text-accent" /> Cycle Éditorial Turbo
                </h2>
                <p className="text-muted text-sm mb-8 leading-relaxed">
                  Le pilote automatique gère le cycle complet (Embedding → Clustering → Scoring → Rédaction) en respectant les quotas API.
                </p>

                <AutoProcessor onStatsUpdate={fetchStats} />
              </div>

              <div className="space-y-6">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted">Status du Serveur</h3>
                <div className="p-6 rounded-2xl border border-border/50 bg-secondary/10">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="font-bold text-sm text-primary">Système Opérationnel</span>
                  </div>
                  <div className="space-y-2 text-xs text-muted">
                    <p>• API Rate Limit: <strong>Géré (Smart Backoff)</strong></p>
                    <p>• Batch Size: <strong>Adaptatif</strong></p>
                    <p>• Mode: <strong>Production</strong></p>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <ArticleManager />
          </div>
        )}
      </div >
    </div >
  );
}
