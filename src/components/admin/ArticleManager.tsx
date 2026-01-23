'use client';

import { useState, useEffect } from 'react';
import { Search, Filter, Trash2, CheckCircle, XCircle, MoreHorizontal, ExternalLink, Loader2, Bot, Sparkles, Layers, X, ArrowUpDown, FileText } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

interface Article {
    id: string;
    title: string;
    source_name: string; // Corrected from 'source'
    published_at: string;
    final_score: number | null;
    source_url: string; // Corrected from 'url'
    summary_short: string | null;
    cluster_id: string | null;
    is_published: boolean;
}

// ...



interface ClusterArticle {
    id: string;
    title: string;
    source_name: string;
    source_url: string;
    published_at: string;
}

export function ArticleManager() {
    const [articles, setArticles] = useState<Article[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    // Sorting
    const [sortBy, setSortBy] = useState('published_at');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

    // Modal state for cluster view
    const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
    const [clusterArticles, setClusterArticles] = useState<ClusterArticle[]>([]);
    const [loadingCluster, setLoadingCluster] = useState(false);
    const [isRewriting, setIsRewriting] = useState<string | null>(null); // ID of article being rewritten
    const [viewArticle, setViewArticle] = useState<Article | null>(null);

    const parseSummary = (json: string | null) => {
        if (!json) return null;
        try {
            return JSON.parse(json);
        } catch (e) {
            return { full: json };
        }
    };

    const fetchArticles = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: page.toString(),
                limit: '20',
                status: filter,
                search,
                sort: sortBy,
                order: sortOrder
            });
            const res = await fetch(`/api/admin/articles?${params}`);
            const data = await res.json();
            console.log("Articles Data Debug:", data.articles); // DEBUG LOG
            setArticles(data.articles || []);
            setTotalPages(data.totalPages || 1);
        } catch (e) {
            console.error("Erreur chargement articles", e);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchArticles();
    }, [page, filter, sortBy, sortOrder]);

    const handleSort = (field: string) => {
        if (sortBy === field) {
            setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
        } else {
            setSortBy(field);
            setSortOrder('desc');
        }
    };

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setPage(1);
        fetchArticles();
    };

    const handleAction = async (id: string, action: 'delete' | 'publish' | 'reject') => {
        if (!confirm("Confirmer l'action ?")) return;

        try {
            if (action === 'delete') {
                await fetch(`/api/admin/articles?id=${id}`, { method: 'DELETE' });
            } else if (action === 'publish') {
                await fetch('/api/admin/articles', {
                    method: 'PATCH',
                    body: JSON.stringify({ id, updates: { final_score: 8, is_published: true } })
                });
            } else if (action === 'reject') {
                await fetch('/api/admin/articles', {
                    method: 'PATCH',
                    body: JSON.stringify({ id, updates: { final_score: 0 } })
                });
            }
            fetchArticles();
        } catch (e) {
            console.error("Action échouée", e);
        }
    };

    const handleRewrite = async (id: string) => {
        if (!confirm("Forcer la réécriture par IA ? Cela écrasera le contenu actuel.")) return;
        setIsRewriting(id);
        try {
            const res = await fetch('/api/admin/rewrite', {
                method: 'POST',
                body: JSON.stringify({ id })
            });
            if (res.ok) {
                fetchArticles(); // Refresh to see changes
            }
        } catch (e) {
            console.error("Rewrite failed", e);
        }
        setIsRewriting(null);
    };

    const viewCluster = async (clusterId: string) => {
        setSelectedClusterId(clusterId);
        setLoadingCluster(true);
        try {
            const res = await fetch(`/api/admin/cluster?clusterId=${clusterId}`);
            const data = await res.json();
            setClusterArticles(data.articles || []);
        } catch (e) {
            console.error("Failed to fetch cluster", e);
        }
        setLoadingCluster(false);
    };

    const isAiRewritten = (article: Article) => {
        return article.summary_short && article.summary_short.length > 10;
    };

    const filterLabels: Record<string, string> = {
        'all': 'Tous',
        'published': 'Publiés',
        'ready': 'Prêts',
        'relevant': 'Pertinents',
        'low_score': 'Rejetés/Faibles',
        'pending': 'En attente'
    };

    return (
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden relative">
            {/* Header / Tools */}
            <div className="p-4 border-b border-border flex flex-col md:flex-row gap-4 justify-between items-center bg-secondary/10">
                <div className="flex items-center gap-2 overflow-x-auto max-w-full pb-2 md:pb-0 no-scrollbar">
                    {['all', 'published', 'ready', 'relevant', 'low_score', 'pending'].map(f => (
                        <button
                            key={f}
                            onClick={() => { setFilter(f); setPage(1); }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-colors ${filter === f
                                ? 'bg-accent text-white shadow-md'
                                : 'bg-background hover:bg-secondary text-muted-foreground'
                                }`}
                        >
                            {filterLabels[f]}
                        </button>
                    ))}
                </div>

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

            {/* Table */}
            <div className="overflow-x-auto min-h-[400px]">
                <table className="w-full text-left text-sm">
                    <thead className="bg-secondary/20 text-muted-foreground font-medium border-b border-border">
                        <tr>
                            <th className="px-4 py-3 w-16 cursor-pointer hover:bg-secondary/30 transition-colors" onClick={() => handleSort('final_score')}>
                                <div className="flex items-center gap-1">Score <ArrowUpDown className="w-3 h-3 text-muted" /></div>
                            </th>
                            <th className="px-4 py-3">Titre</th>
                            <th className="px-4 py-3 w-32">Cluster</th>
                            <th className="px-4 py-3 w-32 cursor-pointer hover:bg-secondary/30 transition-colors" onClick={() => handleSort('published_at')}>
                                <div className="flex items-center gap-1">Date <ArrowUpDown className="w-3 h-3 text-muted" /></div>
                            </th>
                            <th className="px-4 py-3 w-48 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                        {loading ? (
                            <tr>
                                <td colSpan={5} className="p-8 text-center text-muted">
                                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                                    Chargement...
                                </td>
                            </tr>
                        ) : articles.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="p-8 text-center text-muted">Aucun article trouvé.</td>
                            </tr>
                        ) : (
                            articles.map((article) => (
                                <tr key={article.id} className="hover:bg-secondary/10 transition-colors group">
                                    <td className="px-4 py-3">
                                        <span className={`inline-block px-2 py-1 rounded text-xs font-bold ${(article.final_score || 0) >= 6
                                            ? 'bg-green-500/10 text-green-500'
                                            : (article.final_score === null)
                                                ? 'bg-yellow-500/10 text-yellow-500'
                                                : 'bg-red-500/10 text-red-500'
                                            }`}>
                                            {article.final_score ?? '?'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            {article.is_published && (
                                                <span className="bg-green-500/10 text-green-500 p-0.5 rounded" title="Publié">
                                                    <ExternalLink className="w-3.5 h-3.5" />
                                                </span>
                                            )}
                                            {isAiRewritten(article) && (
                                                <span className="bg-purple-500/10 text-purple-500 p-0.5 rounded" title="Réécrit par IA">
                                                    <Bot className="w-3.5 h-3.5" />
                                                </span>
                                            )}
                                            <div className="font-medium text-foreground truncate max-w-lg cursor-pointer hover:text-accent" title={article.title} onClick={() => setViewArticle(article)}>
                                                {article.title}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-secondary text-muted-foreground border border-border/50">
                                                {article.source_name || (article.source_url ? new URL(article.source_url).hostname.replace('www.', '') : 'Source inc.')}
                                            </span>
                                            {article.source_url ? (
                                                <a
                                                    href={article.source_url.startsWith('http') ? article.source_url : `https://${article.source_url}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-[10px] text-muted-foreground hover:text-accent underline flex items-center gap-1 ml-1"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <ExternalLink className="w-2.5 h-2.5" />
                                                </a>
                                            ) : (
                                                <span className="text-[10px] text-red-500/80 flex items-center gap-1 ml-1 cursor-help" title="L'URL est manquante en base de données">
                                                    <XCircle className="w-3 h-3" />
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        {article.cluster_id ? (
                                            <button
                                                onClick={() => viewCluster(article.cluster_id!)}
                                                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 px-2 py-1 rounded-full transition-colors"
                                            >
                                                <Layers className="w-3 h-3" />
                                                Voir
                                            </button>
                                        ) : (
                                            <span className="text-muted/30 text-xs">-</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-muted text-xs whitespace-nowrap">
                                        {formatDistanceToNow(new Date(article.published_at), { addSuffix: true, locale: fr })}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {article.summary_short && (
                                                <button
                                                    onClick={() => setViewArticle(article)}
                                                    title="Voir le contenu IA"
                                                    className="p-1.5 hover:bg-blue-500/20 text-blue-500 rounded transition-colors"
                                                >
                                                    <FileText className="w-4 h-4" />
                                                </button>
                                            )}
                                            <div className="w-px h-4 bg-border/50 mx-1" />
                                            <button
                                                onClick={() => handleRewrite(article.id)}
                                                disabled={isRewriting === article.id}
                                                title="Forcer la réécriture IA"
                                                className="p-1.5 hover:bg-purple-500/20 text-purple-500 rounded transition-colors disabled:opacity-50"
                                            >
                                                {isRewriting === article.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                            </button>
                                            <div className="w-px h-4 bg-border/50 mx-1" />
                                            <button
                                                onClick={() => handleAction(article.id, 'publish')}
                                                title="Publier (Score 8)"
                                                className="flex items-center gap-1.5 px-2 py-1 bg-green-500/10 hover:bg-green-500/20 text-green-600 rounded-md text-[10px] uppercase font-bold tracking-wider transition-colors"
                                            >
                                                <CheckCircle className="w-3 h-3" /> Publier
                                            </button>
                                            <button
                                                onClick={() => handleAction(article.id, 'reject')}
                                                title="Rejeter (Score 0)"
                                                className="flex items-center gap-1.5 px-2 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-md text-[10px] uppercase font-bold tracking-wider transition-colors"
                                            >
                                                <XCircle className="w-3 h-3" /> Rejeter
                                            </button>
                                            <button
                                                onClick={() => handleAction(article.id, 'delete')}
                                                title="Supprimer"
                                                className="p-1.5 hover:bg-gray-500/20 text-muted-foreground hover:text-red-600 rounded transition-colors"
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
            <div className="p-4 border-t border-border flex justify-between items-center bg-secondary/5 text-xs text-muted">
                <div>
                    Page {page} sur {totalPages}
                </div>
                <div className="flex gap-2">
                    <button
                        disabled={page <= 1}
                        onClick={() => setPage(p => p - 1)}
                        className="px-3 py-1 bg-background border border-border rounded hover:bg-secondary disabled:opacity-50"
                    >
                        Préc.
                    </button>
                    <button
                        disabled={page >= totalPages}
                        onClick={() => setPage(p => p + 1)}
                        className="px-3 py-1 bg-background border border-border rounded hover:bg-secondary disabled:opacity-50"
                    >
                        Suiv.
                    </button>
                </div>
            </div>

            {/* Cluster Modal */}
            {selectedClusterId && (
                <div className="absolute inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-8 animate-in fade-in duration-200">
                    <div className="bg-card border border-border rounded-xl shadow-2xl max-w-2xl w-full max-h-full flex flex-col">
                        <div className="p-4 border-b border-border flex justify-between items-center">
                            <h3 className="font-bold flex items-center gap-2">
                                <Layers className="w-4 h-4 text-blue-400" />
                                Sources du Cluster
                            </h3>
                            <button onClick={() => setSelectedClusterId(null)} className="p-1 hover:bg-secondary rounded">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-4 overflow-y-auto">
                            {loadingCluster ? (
                                <div className="flex justify-center p-8"><Loader2 className="animate-spin text-muted" /></div>
                            ) : (
                                <div className="space-y-3">
                                    {clusterArticles.length > 0 ? (
                                        <>
                                            {clusterArticles.length === 1 && (
                                                <div className="text-center text-xs text-muted-foreground p-2 bg-secondary/10 rounded mb-2">
                                                    Cet article n'a pas encore de doublons ou sources similaires (Cluster Unique).
                                                </div>
                                            )}
                                            {clusterArticles.map(a => (
                                                <div key={a.id} className="p-3 bg-secondary/20 rounded-lg border border-border/50">
                                                    <h4 className="font-medium text-sm mb-1">{a.title}</h4>
                                                    <div className="flex justify-between items-center text-xs text-muted">
                                                        <span>{a.source_name} • {new Date(a.published_at).toLocaleDateString()}</span>
                                                        <a href={a.source_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-accent hover:underline">
                                                            Lire <ExternalLink className="w-3 h-3" />
                                                        </a>
                                                    </div>
                                                </div>
                                            ))}
                                        </>
                                    ) : (
                                        <div className="text-center text-muted p-4">
                                            Aucune source trouvée dans ce cluster.
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            {/* View Content Modal */}
            {viewArticle && (
                <div className="absolute inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-8 animate-in fade-in duration-200">
                    <div className="bg-card border border-border rounded-xl shadow-2xl max-w-3xl w-full max-h-full flex flex-col">
                        <div className="p-4 border-b border-border flex justify-between items-center bg-secondary/10">
                            <div>
                                <h3 className="font-bold text-lg mb-1 flex items-center gap-2">
                                    <Bot className="w-5 h-5 text-purple-500" />
                                    Aperçu du contenu IA
                                </h3>
                                <div className="text-sm text-muted">ID: {viewArticle.id}</div>
                            </div>
                            <button onClick={() => setViewArticle(null)} className="p-1 hover:bg-secondary rounded"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-6 overflow-y-auto font-serif leading-relaxed">
                            {(() => {
                                const content = parseSummary(viewArticle.summary_short);
                                if (!content || !content.full) return <div className="text-center text-muted italic">Aucun contenu généré pour cet article.</div>;

                                return (
                                    <div className="space-y-6">
                                        {content.title && <h2 className="text-2xl font-bold">{content.title}</h2>}
                                        {content.tldr && (
                                            <div className="bg-accent/10 border-l-4 border-accent p-4 rounded-r-lg">
                                                <h4 className="text-xs font-bold uppercase text-accent mb-1 tracking-wider">Résumé Express</h4>
                                                <p className="text-sm">{content.tldr}</p>
                                            </div>
                                        )}
                                        <div className="prose prose-invert max-w-none text-muted-foreground whitespace-pre-wrap">
                                            {content.full}
                                        </div>
                                        {content.analysis && (
                                            <div className="bg-secondary/30 p-4 rounded-lg mt-8">
                                                <h4 className="text-xs font-bold uppercase text-muted mb-2 tracking-wider">Analyse d'Impact</h4>
                                                <p className="text-sm">{content.analysis}</p>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>
                        <div className="p-4 border-t border-border bg-secondary/5 flex justify-end gap-2">
                            <button onClick={() => setViewArticle(null)} className="px-4 py-2 text-sm font-medium hover:bg-secondary rounded-lg">Fermer</button>
                            <a href={viewArticle.source_url} target="_blank" rel="noopener noreferrer" className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent/90 flex items-center gap-2">
                                Voir source originale <ExternalLink className="w-4 h-4" />
                            </a>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
