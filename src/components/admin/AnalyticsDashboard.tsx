'use client';

import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area,
} from 'recharts';
import {
    TrendingUp, Database, Layers, Activity, AlertCircle, CheckCircle, RefreshCw, Clock
} from 'lucide-react';

interface AnalyticsData {
    content: {
        total: number;
        published: number;
        pending: number;
        rejected: number;
        last24h: number;
        lastWeek: number;
    };
    categories: { name: string; value: number }[];
    scoreDistribution: { range: string; count: number }[];
    topSources: { name: string; count: number }[];
    clusters: { total: number; multiArticle: number; avgSize: string };
    dailyActivity: { date: string; count: number }[];
    dailyIngestion: { date: string; count: number;[source: string]: number | string }[];
    ingestionSources: string[];
    hourlyActivity: { time: string; count: number }[];
    health: { lastIngestion: string | null; lastSource: string | null };
}

const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

export function AnalyticsDashboard() {
    const [data, setData] = useState<AnalyticsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showIngestionBySource, setShowIngestionBySource] = useState(false);

    const fetchAnalytics = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/admin/analytics');
            if (!res.ok) throw new Error('Failed to fetch');
            const json = await res.json();
            setData(json);
            setError(null);
        } catch (e) {
            setError('Impossible de charger les analytics');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAnalytics();
        const interval = setInterval(fetchAnalytics, 30000); // Refresh every 30s
        return () => clearInterval(interval);
    }, []);

    if (loading && !data) {
        return (
            <div className="flex items-center justify-center h-64">
                <RefreshCw className="w-8 h-8 text-accent animate-spin" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center h-64 text-red-500">
                <AlertCircle className="w-6 h-6 mr-2" /> {error}
            </div>
        );
    }

    if (!data) return null;

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-serif font-medium text-primary flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-accent" /> Analytics Dashboard
                    </h2>
                    <p className="text-sm text-muted mt-1">Vue d'ensemble des performances et métriques</p>
                </div>
                <button
                    onClick={fetchAnalytics}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-secondary/50 hover:bg-secondary rounded-lg text-sm transition-colors"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    Actualiser
                </button>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-card border border-border rounded-xl p-5">
                    <div className="flex items-center gap-2 text-muted text-xs font-bold uppercase tracking-wider mb-2">
                        <Database className="w-4 h-4" /> Total Articles
                    </div>
                    <div className="text-3xl font-serif text-primary">{data.content.total.toLocaleString()}</div>
                    <div className="text-xs text-muted mt-1">+{data.content.last24h} dernières 24h</div>
                </div>

                <div className="bg-card border border-border rounded-xl p-5">
                    <div className="flex items-center gap-2 text-green-500 text-xs font-bold uppercase tracking-wider mb-2">
                        <CheckCircle className="w-4 h-4" /> Publiés
                    </div>
                    <div className="text-3xl font-serif text-green-500">{data.content.published.toLocaleString()}</div>
                    <div className="text-xs text-muted mt-1">{((data.content.published / data.content.total) * 100).toFixed(1)}% du total</div>
                </div>

                <div className="bg-card border border-border rounded-xl p-5">
                    <div className="flex items-center gap-2 text-yellow-500 text-xs font-bold uppercase tracking-wider mb-2">
                        <Clock className="w-4 h-4" /> En Attente
                    </div>
                    <div className="text-3xl font-serif text-yellow-500">{data.content.pending.toLocaleString()}</div>
                    <div className="text-xs text-muted mt-1">Score &gt; 5, non publiés</div>
                </div>

                <div className="bg-card border border-border rounded-xl p-5">
                    <div className="flex items-center gap-2 text-accent text-xs font-bold uppercase tracking-wider mb-2">
                        <Layers className="w-4 h-4" /> Clusters
                    </div>
                    <div className="text-3xl font-serif text-accent">{data.clusters.total.toLocaleString()}</div>
                    <div className="text-xs text-muted mt-1">{data.clusters.multiArticle} multi-sources (avg: {data.clusters.avgSize})</div>
                </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-6">
                <h3 className="text-sm font-bold uppercase tracking-wider text-primary mb-1 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-accent" /> Pulse (72h)
                </h3>
                <p className="text-[10px] text-muted-foreground mb-4">Rythme de publication (Articles générés) heure par heure sur les 3 derniers jours.</p>
                <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data.hourlyActivity}>
                            <defs>
                                <linearGradient id="colorPulse" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <XAxis dataKey="time" tick={{ fontSize: 9 }} interval={6} stroke="#666" />
                            <YAxis tick={{ fontSize: 10 }} stroke="#666" />
                            <Tooltip
                                contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 8 }}
                                labelStyle={{ color: '#fff' }}
                            />
                            <Area type="monotone" dataKey="count" stroke="#3b82f6" fill="url(#colorPulse)" strokeWidth={2} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Ingestion par jour - Heatmap */}
            <div className="bg-card border border-border rounded-xl p-6">
                <div className="flex items-center justify-between mb-1">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-primary flex items-center gap-2">
                        <Database className="w-4 h-4 text-purple-500" /> Ingestion par Source (30 jours)
                    </h3>
                    <button
                        onClick={() => setShowIngestionBySource(!showIngestionBySource)}
                        className={`text-xs px-3 py-1 rounded-full transition-colors ${showIngestionBySource
                            ? 'bg-purple-500/20 text-purple-400'
                            : 'bg-secondary/50 text-muted hover:bg-secondary'
                            }`}
                    >
                        {showIngestionBySource ? 'Heatmap' : 'Courbe totale'}
                    </button>
                </div>
                <p className="text-[10px] text-muted-foreground mb-4">
                    {showIngestionBySource
                        ? 'Heatmap : intensité de couleur = volume d\'articles. Scroll horizontal pour voir tous les jours.'
                        : 'Nombre total d\'articles ingérés par jour depuis les flux RSS.'}
                </p>

                {showIngestionBySource ? (
                    <div className="overflow-x-auto">
                        <div className="min-w-max">
                            {/* Header avec les dates */}
                            <div className="flex mb-1">
                                <div className="w-32 flex-shrink-0" /> {/* Espace pour les noms de sources */}
                                {data.dailyIngestion.map((day) => (
                                    <div key={day.date} className="w-6 text-[8px] text-muted text-center transform -rotate-45 origin-bottom-left h-8">
                                        {day.date}
                                    </div>
                                ))}
                            </div>

                            {/* Grid des sources */}
                            <div className="max-h-96 overflow-y-auto space-y-px">
                                {data.ingestionSources.map((source) => {
                                    // Calculer le max pour cette source pour normaliser
                                    const maxForSource = Math.max(...data.dailyIngestion.map(d => (d[source] as number) || 0));

                                    return (
                                        <div key={source} className="flex items-center group">
                                            <div className="w-32 flex-shrink-0 text-[10px] text-muted truncate pr-2" title={source}>
                                                {source}
                                            </div>
                                            {data.dailyIngestion.map((day) => {
                                                const count = (day[source] as number) || 0;
                                                const intensity = maxForSource > 0 ? count / maxForSource : 0;

                                                return (
                                                    <div
                                                        key={`${source}-${day.date}`}
                                                        className="w-6 h-5 flex-shrink-0 rounded-sm mx-px cursor-pointer transition-all hover:scale-125 hover:z-10 relative group/cell"
                                                        style={{
                                                            backgroundColor: count === 0
                                                                ? 'rgba(100, 100, 100, 0.1)'
                                                                : `rgba(168, 85, 247, ${0.2 + intensity * 0.8})`,
                                                        }}
                                                        title={`${source}: ${count} articles le ${day.date}`}
                                                    >
                                                        {count > 0 && (
                                                            <span className="absolute inset-0 flex items-center justify-center text-[7px] font-bold text-white opacity-0 group-hover/cell:opacity-100">
                                                                {count}
                                                            </span>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Légende */}
                            <div className="flex items-center gap-2 mt-4 text-[10px] text-muted">
                                <span>Moins</span>
                                <div className="flex gap-px">
                                    {[0.1, 0.3, 0.5, 0.7, 1].map((opacity) => (
                                        <div
                                            key={opacity}
                                            className="w-4 h-3 rounded-sm"
                                            style={{ backgroundColor: `rgba(168, 85, 247, ${opacity})` }}
                                        />
                                    ))}
                                </div>
                                <span>Plus</span>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data.dailyIngestion}>
                                <defs>
                                    <linearGradient id="colorIngestion" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="date" tick={{ fontSize: 9 }} minTickGap={15} stroke="#666" />
                                <YAxis tick={{ fontSize: 10 }} stroke="#666" />
                                <Tooltip
                                    contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 8 }}
                                    labelStyle={{ color: '#fff' }}
                                />
                                <Area type="monotone" dataKey="count" stroke="#a855f7" fill="url(#colorIngestion)" strokeWidth={2} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>

            {/* Charts Grid: Trend + Scores */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Trend 30d (Daily) */}
                <div className="bg-card border border-border rounded-xl p-6">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-primary mb-1 flex items-center gap-2">
                        <Activity className="w-4 h-4 text-green-500" /> Tendance (30 jours)
                    </h3>
                    <p className="text-[10px] text-muted-foreground mb-4">Volume quotidien d'articles publiés sur le dernier mois.</p>
                    <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data.dailyActivity}>
                                <defs>
                                    <linearGradient id="colorTrend" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="date" tick={{ fontSize: 9 }} minTickGap={15} stroke="#666" />
                                <YAxis tick={{ fontSize: 10 }} stroke="#666" />
                                <Tooltip
                                    contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 8 }}
                                    labelStyle={{ color: '#fff' }}
                                />
                                <Area type="monotone" dataKey="count" stroke="#22c55e" fill="url(#colorTrend)" strokeWidth={2} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Score Distribution */}
                <div className="bg-card border border-border rounded-xl p-6">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-primary mb-1">📊 Distribution des Scores</h3>
                    <p className="text-[10px] text-muted-foreground mb-4">Répartition des scores de pertinence (0-10) attribués par l'IA. Les articles &gt;5 sont éligibles à la publication.</p>
                    <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.scoreDistribution}>
                                <XAxis dataKey="range" tick={{ fontSize: 10 }} stroke="#666" />
                                <YAxis tick={{ fontSize: 10 }} stroke="#666" />
                                <Tooltip
                                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                    contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 8 }}
                                    labelStyle={{ color: '#fff' }}
                                />
                                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                                    {data.scoreDistribution.map((entry, index) => {
                                        let color = '#ef4444'; // Red for low
                                        if (index >= 5 && index < 8) color = '#f59e0b'; // Yellow for mid
                                        if (index >= 8) color = '#22c55e'; // Green for high
                                        return <Cell key={`cell-${index}`} fill={color} />;
                                    })}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Health Check */}
            <div className="bg-card border border-border rounded-xl p-6">
                <h3 className="text-sm font-bold uppercase tracking-wider text-primary mb-1 flex items-center gap-2">
                    ⚡ Health Check
                </h3>
                <p className="text-[10px] text-muted-foreground mb-4">Indicateurs de santé du pipeline : fraîcheur des données, efficacité du filtrage et taux de conversion vers la publication.</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 bg-secondary/20 rounded-lg">
                        <div className="text-xs text-muted mb-1">Dernière Ingestion</div>
                        <div className="font-medium text-primary">
                            {data.health.lastIngestion
                                ? formatDistanceToNow(new Date(data.health.lastIngestion), { addSuffix: true, locale: fr })
                                : 'N/A'}
                        </div>
                        <div className="text-[10px] text-muted mt-1">Source: {data.health.lastSource || 'N/A'}</div>
                    </div>
                    <div className="p-4 bg-secondary/20 rounded-lg">
                        <div className="text-xs text-muted mb-1">Taux de Publication</div>
                        <div className="font-medium text-green-500">
                            {((data.content.published / data.content.total) * 100).toFixed(1)}%
                        </div>
                    </div>
                    <div className="p-4 bg-secondary/20 rounded-lg">
                        <div className="text-xs text-muted mb-1">Taux de Rejet (Clusters)</div>
                        <div className="font-medium text-red-500">
                            {/* Rejected Clusters / (Published + Pending + Rejected) to see strict rejection rate of SCORED clusters */}
                            {((data.content.rejected / (data.content.published + data.content.pending + data.content.rejected)) * 100).toFixed(1)}%
                        </div>
                    </div>
                </div>
            </div>

            {/* Charts Row 2 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Category Pie */}
                <div className="bg-card border border-border rounded-xl p-6">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-primary mb-1">🗂️ Répartition par Catégorie</h3>
                    <p className="text-[10px] text-muted-foreground mb-4">Distribution thématique des articles publiés. Les catégories sont assignées automatiquement par l'IA lors du scoring.</p>
                    <div className="h-56 flex items-center gap-4">
                        <div className="w-1/2 h-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={data.categories.slice(0, 8)}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={40}
                                        outerRadius={70}
                                        paddingAngle={2}
                                        dataKey="value"
                                    >
                                        {data.categories.slice(0, 8).map((_, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 8 }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="w-1/2 space-y-1 text-xs">
                            {data.categories.slice(0, 8).map((cat, i) => (
                                <div key={cat.name} className="flex items-center justify-between">
                                    <span className="flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                                        <span className="truncate max-w-[100px]">{cat.name}</span>
                                    </span>
                                    <span className="font-mono text-muted">{cat.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Top Sources */}
                <div className="bg-card border border-border rounded-xl p-6">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-primary mb-1">📰 Top 10 Sources</h3>
                    <p className="text-[10px] text-muted-foreground mb-4">Les médias qui contribuent le plus à votre flux. Utile pour identifier les sources les plus actives ou à diversifier.</p>
                    <div className="space-y-2">
                        {data.topSources.map((src, i) => (
                            <div key={src.name} className="flex items-center gap-3">
                                <span className="text-xs font-mono text-muted w-4">{i + 1}</span>
                                <div className="flex-1 bg-secondary/30 rounded-full h-5 overflow-hidden">
                                    <div
                                        className="h-full bg-accent/60 rounded-full flex items-center px-2"
                                        style={{ width: `${(src.count / data.topSources[0].count) * 100}%` }}
                                    >
                                        <span className="text-[10px] font-bold text-white truncate">{src.name}</span>
                                    </div>
                                </div>
                                <span className="text-xs font-mono text-muted w-8 text-right">{src.count}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>


        </div>
    );
}
