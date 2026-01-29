'use client';

import { useState, useEffect } from 'react';
import { Search, Trash2, ExternalLink, Loader2, Link2, Calendar, Database, ShieldAlert, FileText, X, Bot } from 'lucide-react';

interface Article {
    id: string;
    title: string;
    source_url: string; // URL from DB
    url?: string; // For backward compatibility if needed, but we rely on source_url
    source_name: string; // Fixed: Matches DB column
    published_at: string;
    created_at: string;
    cluster_id: string | null;
    content: string; // For inspection
    cluster?: { label: string }; // From Join
}

export function RawArticleManager() {
    const [articles, setArticles] = useState<Article[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [sourceFilter, setSourceFilter] = useState('all');
    const [sources, setSources] = useState<string[]>([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalArticles, setTotalArticles] = useState(0);

    // Content Inspection Modal
    const [viewArticle, setViewArticle] = useState<Article | null>(null);

    const fetchSources = async () => {
        try {
            // We use the existing sources API to get the list
            const res = await fetch('/api/admin/sources');
            const data = await res.json();
            if (data.sources) {
                setSources(data.sources.map((s: any) => s.name));
            }
        } catch (e) {
            console.error("Erreur chargement sources", e);
        }
    };

    const fetchArticles = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: page.toString(),
                limit: '50',
                search,
                source: sourceFilter
            });
            const res = await fetch(`/api/admin/raw-articles?${params}`);
            const data = await res.json();
            setArticles(data.articles || []);
            setTotalPages(data.totalPages || 1);
            setTotalArticles(data.total || 0);
        } catch (e) {
            console.error("Erreur chargement articles", e);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchSources();
    }, []);

    useEffect(() => {
        setPage(1);
        fetchArticles();
    }, [sourceFilter]);

    useEffect(() => {
        fetchArticles();
    }, [page]);

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setPage(1);
        fetchArticles();
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Supprimer définitivement cet article ?")) return;

        try {
            await fetch(`/api/admin/raw-articles?id=${id}`, { method: 'DELETE' });
            fetchArticles();
        } catch (e) {
            console.error("Suppression échouée", e);
        }
    };

    // Cluster Inspection Modal
    const [viewCluster, setViewCluster] = useState<{ id: string, label: string } | null>(null);
    const [clusterArticles, setClusterArticles] = useState<Article[]>([]);
    const [loadingCluster, setLoadingCluster] = useState(false);

    useEffect(() => {
        if (viewCluster) {
            fetchClusterArticles(viewCluster.id);
        }
    }, [viewCluster]);

    const fetchClusterArticles = async (clusterId: string) => {
        setLoadingCluster(true);
        try {
            const res = await fetch(`/api/admin/raw-articles?cluster_id=${clusterId}&limit=100`);
            const data = await res.json();
            setClusterArticles(data.articles || []);
        } catch (e) {
            console.error("Erreur chargement articles du cluster", e);
        }
        setLoadingCluster(false);
    };

    return (
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden relative min-h-[600px]">
            {/* Header / Tools */}
            <div className="p-4 border-b border-border flex flex-col md:flex-row gap-4 justify-between items-center bg-secondary/10 shrink-0">
                <div className="flex items-center gap-2">
                    <Database className="w-5 h-5 text-muted-foreground" />
                    <span className="font-bold text-sm text-foreground">
                        {totalArticles} articles archivés
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    <select
                        value={sourceFilter}
                        onChange={(e) => setSourceFilter(e.target.value)}
                        className="bg-background border border-border rounded-lg text-sm px-3 py-2 focus:outline-none focus:border-accent max-w-[150px]"
                    >
                        <option value="all">Toutes sources</option>
                        {sources.map(s => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </select>

                    <form onSubmit={handleSearchSubmit} className="relative w-full md:w-64">
                        <input
                            type="text"
                            placeholder="Rechercher..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:border-accent"
                        />
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted" />
                    </form>
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm relative">
                    <thead className="bg-secondary/20 text-muted-foreground font-medium border-b border-border sticky top-0 backdrop-blur-sm z-10">
                        <tr>
                            <th className="px-4 py-3 w-40">Date</th>
                            <th className="px-4 py-3 w-32">Source</th>
                            <th className="px-4 py-3">Titre</th>
                            <th className="px-4 py-3 w-48 text-center text-xs uppercase tracking-wider">Cluster</th>
                            <th className="px-4 py-3 w-24 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                        {loading ? (
                            <tr>
                                <td colSpan={5} className="p-16 text-center text-muted">
                                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 opacity-50" />
                                    Chargement des archives...
                                </td>
                            </tr>
                        ) : articles.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="p-16 text-center text-muted">
                                    Aucun article trouvé.
                                </td>
                            </tr>
                        ) : (
                            articles.map((article) => (
                                <tr key={article.id} className="hover:bg-secondary/10 transition-colors group">
                                    <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                                        <div className="flex flex-col">
                                            <span className="font-medium text-foreground">
                                                {new Date(article.published_at).toLocaleDateString()}
                                            </span>
                                            <span className="opacity-70">
                                                {new Date(article.published_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-secondary/50 border border-border/50 text-xs font-medium whitespace-nowrap overflow-hidden max-w-[120px] text-ellipsis" title={article.source_name}>
                                            {article.source_name}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-start gap-2">
                                            <button
                                                onClick={() => setViewArticle(article)}
                                                className="font-medium text-foreground hover:text-accent text-left line-clamp-2 transition-colors"
                                            >
                                                {article.title}
                                            </button>
                                            <a
                                                href={article.source_url || article.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="opacity-30 hover:opacity-100 hover:text-accent transition-opacity mt-0.5 shrink-0"
                                                title="Ouvrir l'URL originale"
                                            >
                                                <ExternalLink className="w-3.5 h-3.5" />
                                            </a>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        {article.cluster_id ? (
                                            <button
                                                onClick={() => setViewCluster({ id: article.cluster_id!, label: article.cluster?.label || 'Cluster sans nom' })}
                                                className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-secondary/50 hover:bg-accent/10 hover:text-accent hover:border-accent/20 border border-border transition-all text-xs max-w-[200px]"
                                                title="Voir tous les articles de ce cluster"
                                            >
                                                <Link2 className="w-3 h-3 flex-shrink-0" />
                                                <span className="truncate">{article.cluster?.label || 'Voir le cluster'}</span>
                                            </button>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-500 text-[10px] font-bold uppercase tracking-wider border border-yellow-500/20">
                                                <ShieldAlert className="w-3 h-3" /> Orphelin
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <button
                                                onClick={() => setViewArticle(article)}
                                                className="p-2 hover:bg-blue-500/10 text-muted-foreground hover:text-blue-500 rounded-lg transition-colors"
                                                title="Inspecter le contenu"
                                            >
                                                <FileText className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(article.id)}
                                                className="p-2 hover:bg-red-500/10 text-muted-foreground hover:text-red-500 rounded-lg transition-colors"
                                                title="Supprimer définitivement"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            <div className="p-3 border-t border-border flex justify-between items-center bg-secondary/5 text-xs text-muted shrink-0">
                <div>
                    Page {page} sur {totalPages}
                </div>
                <div className="flex gap-2">
                    <button
                        disabled={page <= 1}
                        onClick={() => setPage(p => p - 1)}
                        className="px-3 py-1.5 bg-background border border-border rounded hover:bg-secondary disabled:opacity-50 transition-colors"
                    >
                        Précédent
                    </button>
                    <button
                        disabled={page >= totalPages}
                        onClick={() => setPage(p => p + 1)}
                        className="px-3 py-1.5 bg-background border border-border rounded hover:bg-secondary disabled:opacity-50 transition-colors"
                    >
                        Suivant
                    </button>
                </div>
            </div>

            {/* Inspect Modal */}
            {viewArticle && (
                <div
                    className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 md:p-12 animate-in fade-in duration-200"
                    onClick={() => setViewArticle(null)}
                >
                    <div
                        className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-4xl max-h-full flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-4 border-b border-border flex justify-between items-center bg-secondary/10">
                            <h3 className="font-bold text-lg flex items-center gap-2 truncate pr-4">
                                <FileText className="w-5 h-5 text-accent" />
                                Inspection : {viewArticle.title}
                            </h3>
                            <button
                                onClick={() => setViewArticle(null)}
                                className="p-1 hover:bg-secondary rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto space-y-6 max-h-[80vh]">
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                                <div className="p-3 bg-secondary/20 rounded border border-border/50">
                                    <span className="block text-muted-foreground uppercase tracking-wider font-bold mb-1">Source</span>
                                    {viewArticle.source_name}
                                </div>
                                <div className="p-3 bg-secondary/20 rounded border border-border/50">
                                    <span className="block text-muted-foreground uppercase tracking-wider font-bold mb-1">Date</span>
                                    {new Date(viewArticle.published_at).toLocaleString()}
                                </div>
                                <div className="p-3 bg-secondary/20 rounded border border-border/50">
                                    <span className="block text-muted-foreground uppercase tracking-wider font-bold mb-1">Cluster</span>
                                    {viewArticle.cluster_id ? (viewArticle.cluster?.label || 'ID: ' + viewArticle.cluster_id.substring(0, 8) + '...') : 'Aucun'}
                                </div>
                                <div className="p-3 bg-secondary/20 rounded border border-border/50">
                                    <span className="block text-muted-foreground uppercase tracking-wider font-bold mb-1">ID DB</span>
                                    <span className="font-mono">{viewArticle.id.substring(0, 8)}...</span>
                                </div>
                            </div>

                            <div>
                                <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2">Contenu stocké</h4>
                                <div className="p-4 bg-secondary/10 rounded-lg border border-border/50 font-serif whitespace-pre-wrap max-h-[400px] overflow-y-auto text-sm">
                                    {viewArticle.content}
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
                                <a
                                    href={viewArticle.source_url || viewArticle.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 px-4 py-2 bg-secondary text-foreground rounded-lg hover:bg-secondary/80 font-medium text-sm transition-colors"
                                >
                                    <ExternalLink className="w-4 h-4" /> Voir l'original
                                </a>
                                <button
                                    onClick={() => {
                                        handleDelete(viewArticle.id);
                                        setViewArticle(null);
                                    }}
                                    className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-500 border border-red-500/20 rounded-lg hover:bg-red-500/20 font-medium text-sm transition-colors"
                                >
                                    <Trash2 className="w-4 h-4" /> Supprimer
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Cluster Modal */}
            {viewCluster && (
                <div
                    className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 md:p-12 animate-in fade-in duration-200"
                    onClick={() => setViewCluster(null)}
                >
                    <div
                        className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-4 border-b border-border flex justify-between items-center bg-secondary/10">
                            <h3 className="font-bold text-lg flex items-center gap-2 truncate pr-4">
                                <Link2 className="w-5 h-5 text-accent" />
                                Cluster : {viewCluster.label}
                            </h3>
                            <button
                                onClick={() => setViewCluster(null)}
                                className="p-1 hover:bg-secondary rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="overflow-auto flex-1 p-0">
                            {loadingCluster ? (
                                <div className="p-12 text-center text-muted">
                                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 opacity-50" />
                                    Chargement des articles du cluster...
                                </div>
                            ) : (
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-secondary/20 text-muted-foreground font-medium border-b border-border sticky top-0 backdrop-blur-sm">
                                        <tr>
                                            <th className="px-4 py-3 w-32">Source</th>
                                            <th className="px-4 py-3">Titre</th>
                                            <th className="px-4 py-3 w-40">Date</th>
                                            <th className="px-4 py-3 w-16"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/50">
                                        {clusterArticles.map(article => (
                                            <tr key={article.id} className="hover:bg-secondary/10 transition-colors">
                                                <td className="px-4 py-3">
                                                    <span className="text-xs font-medium text-muted-foreground">{article.source_name}</span>
                                                </td>
                                                <td className="px-4 py-3 font-medium">
                                                    {article.title}
                                                </td>
                                                <td className="px-4 py-3 text-xs text-muted-foreground">
                                                    {new Date(article.published_at).toLocaleString()}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <a
                                                        href={article.source_url || article.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="p-2 hover:text-accent transition-colors"
                                                    >
                                                        <ExternalLink className="w-4 h-4" />
                                                    </a>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                        <div className="p-4 border-t border-border bg-secondary/5 text-xs text-muted text-center">
                            {clusterArticles.length} article(s) dans ce cluster
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
