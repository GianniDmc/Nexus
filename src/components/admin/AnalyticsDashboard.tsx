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
    health: { lastIngestion: string | null; lastSource: string | null };
}

const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

export function AnalyticsDashboard() {
    const [data, setData] = useState<AnalyticsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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

            {/* Charts Row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Daily Activity */}
                <div className="bg-card border border-border rounded-xl p-6">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-primary mb-4 flex items-center gap-2">
                        <Activity className="w-4 h-4 text-accent" /> Activité (7 derniers jours)
                    </h3>
                    <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data.dailyActivity}>
                                <defs>
                                    <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#666" />
                                <YAxis tick={{ fontSize: 10 }} stroke="#666" />
                                <Tooltip
                                    contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 8 }}
                                    labelStyle={{ color: '#fff' }}
                                />
                                <Area type="monotone" dataKey="count" stroke="#22c55e" fill="url(#colorCount)" strokeWidth={2} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Score Distribution */}
                <div className="bg-card border border-border rounded-xl p-6">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-primary mb-4">📊 Distribution des Scores</h3>
                    <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.scoreDistribution}>
                                <XAxis dataKey="range" tick={{ fontSize: 10 }} stroke="#666" />
                                <YAxis tick={{ fontSize: 10 }} stroke="#666" />
                                <Tooltip
                                    contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 8 }}
                                    labelStyle={{ color: '#fff' }}
                                />
                                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Charts Row 2 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Category Pie */}
                <div className="bg-card border border-border rounded-xl p-6">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-primary mb-4">🗂️ Répartition par Catégorie</h3>
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
                    <h3 className="text-sm font-bold uppercase tracking-wider text-primary mb-4">📰 Top 10 Sources</h3>
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

            {/* Health Check */}
            <div className="bg-card border border-border rounded-xl p-6">
                <h3 className="text-sm font-bold uppercase tracking-wider text-primary mb-4 flex items-center gap-2">
                    ⚡ Health Check
                </h3>
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
                        <div className="text-xs text-muted mb-1">Taux de Rejet</div>
                        <div className="font-medium text-red-500">
                            {((data.content.rejected / data.content.total) * 100).toFixed(1)}%
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
