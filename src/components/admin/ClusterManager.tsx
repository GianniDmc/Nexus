'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { GitBranch, ChevronDown, ChevronRight, Loader2, FlaskConical, CheckCircle, ExternalLink, Search, Filter, ChevronLeft, ListOrdered } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

interface Cluster {
    id: string;
    label: string;
    is_published: boolean;
    final_score: number | null;
    article_count: number;
    created_at: string;
}

interface Article {
    id: string;
    title: string;
    source_name?: string;
    source?: string;
    url?: string;
    score?: number;
    published_at?: string;
    cluster_id?: string;
}

interface SimulationResult {
    article: Article;
    matches: Match[];
    decision: 'JOIN_EXISTING' | 'CREATE_CLUSTER' | 'NEW_CLUSTER';
    targetCluster?: { id: string; label: string; article_count: number; previewArticles?: Article[] };
}

interface Match {
    id: string;
    title: string;
    published_at: string;
    similarity: number;
    cluster: Cluster | null;
    matchType?: 'valid' | 'weak';
}

// Sub-component for searchable article selection
function ArticleSearch({
    label,
    value,
    onChange
}: {
    label: string;
    value: Article | null;
    onChange: (article: Article | null) => void;
}) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<Article[]>([]);
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [wrapperRef]);

    // Search effect
    useEffect(() => {
        // If query matches current value title, don't search
        if (value && query === value.title) return;

        // Allow empty query (fetches recent articles)

        const timer = setTimeout(async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/admin/similarity?search=${encodeURIComponent(query)}`);
                const data = await res.json();
                setResults(data.articles || []);
                // Only auto-open if we have results and it's an explicit search or focus interaction
                // (Handled by onFocus/onChange)
            } catch (e) {
                console.error("Search error", e);
            } finally {
                setLoading(false);
            }
        }, 400); // Debounce

        return () => clearTimeout(timer);
    }, [query, value]);

    // Initial Value Sync
    useEffect(() => {
        if (value) setQuery(value.title);
    }, [value]);

    return (
        <div className="relative" ref={wrapperRef}>
            <label className="text-xs text-muted uppercase tracking-wide mb-2 block">{label}</label>
            <div className="relative">
                <input
                    type="text"
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        if (!e.target.value) onChange(null);
                        setIsOpen(true);
                    }}
                    onFocus={() => setIsOpen(true)}
                    placeholder="Rechercher un article..."
                    className="w-full p-3 pl-9 bg-secondary border border-border rounded-lg text-sm focus:ring-2 focus:ring-accent outline-none transition-all"
                />
                <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                {loading && (
                    <Loader2 className="w-4 h-4 text-accent animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
                )}
            </div>

            {/* Results Dropdown */}
            {isOpen && results.length > 0 && query !== value?.title && (
                <div className="absolute z-10 w-full mt-1 bg-card border border-border rounded-lg shadow-xl max-h-60 overflow-y-auto">
                    {results.map((article) => (
                        <button
                            key={article.id}
                            onClick={() => {
                                onChange(article);
                                setQuery(article.title);
                                setIsOpen(false);
                            }}
                            className="w-full text-left p-3 hover:bg-secondary truncate text-sm flex flex-col gap-1 border-b border-border/50 last:border-0"
                        >
                            <span className="font-medium truncate block">{article.title}</span>
                            <div className="flex items-center gap-2 text-xs text-muted">
                                <span>[{article.source_name}]</span>
                                {article.published_at && (
                                    <span>• {formatDistanceToNow(new Date(article.published_at), { addSuffix: true, locale: fr })}</span>
                                )}
                                {article.cluster_id && (
                                    <span className="text-[10px] bg-blue-500/10 text-blue-500 px-1.5 py-0.5 rounded border border-blue-500/20">
                                        Clustérisé
                                    </span>
                                )}
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

export function ClusterManager() {
    const [clusters, setClusters] = useState<Cluster[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalClusters, setTotalClusters] = useState(0);
    const [filterStatus, setFilterStatus] = useState<'all' | 'published' | 'unpublished' | 'important'>('all');
    const [sortBy, setSortBy] = useState<'date_desc' | 'score_desc' | 'count_desc'>('date_desc');
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [expandedCluster, setExpandedCluster] = useState<string | null>(null);
    const [clusterArticles, setClusterArticles] = useState<Article[]>([]);
    const [loadingClusterArticles, setLoadingClusterArticles] = useState(false);

    // Similarity tester state
    const [selectedArticle1, setSelectedArticle1] = useState<Article | null>(null);
    const [testingSimlarity, setTestingSimilarity] = useState(false);
    const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchQuery), 500);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const fetchClusters = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: page.toString(),
                limit: '15',
                status: filterStatus,
                sort: sortBy
            });
            if (debouncedSearch) params.append('search', debouncedSearch);

            const res = await fetch(`/api/admin/clusters?${params.toString()}`);
            const data = await res.json();
            setClusters(data.clusters || []);
            setTotalPages(data.totalPages || 1);
            setTotalClusters(data.total || 0);
        } catch (e) {
            console.error('Error fetching clusters', e);
        } finally {
            setLoading(false);
        }
    }, [page, filterStatus, sortBy, debouncedSearch]);

    useEffect(() => {
        fetchClusters();
    }, [fetchClusters]);

    const fetchClusterArticles = async (clusterId: string) => {
        setLoadingClusterArticles(true);
        try {
            const res = await fetch(`/api/admin/cluster?clusterId=${clusterId}`);
            const data = await res.json();
            setClusterArticles(data.articles || []);
        } catch (e) {
            console.error('Error fetching cluster articles', e);
        } finally {
            setLoadingClusterArticles(false);
        }
    };

    const toggleCluster = (clusterId: string) => {
        if (expandedCluster === clusterId) {
            setExpandedCluster(null);
            setClusterArticles([]);
        } else {
            setExpandedCluster(clusterId);
            fetchClusterArticles(clusterId);
        }
    };

    const simulateClustering = async () => {
        if (!selectedArticle1) return;
        setTestingSimilarity(true);
        setSimulationResult(null);

        try {
            const res = await fetch('/api/admin/simulate-clustering', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ articleId: selectedArticle1.id })
            });
            const data = await res.json();
            setSimulationResult(data);
        } catch (e) {
            console.error('Error testing similarity', e);
        } finally {
            setTestingSimilarity(false);
        }
    };

    const getScoreColor = (score: number) => {
        if (score >= 0.75) return 'text-green-500';
        if (score >= 0.6) return 'text-yellow-500';
        return 'text-red-500';
    };



    return (
        <div className="space-y-8">
            {/* Clustering Simulation */}
            <div className="bg-card border border-border rounded-xl p-6">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                    <FlaskConical className="w-5 h-5 text-accent" />
                    Simulation de Clustering
                </h2>
                <p className="text-sm text-muted mb-6">
                    Sélectionnez un article pour voir comment le moteur de clustering le traiterait (rejoint un cluster existant ou en crée un nouveau).
                    <br />
                    <span className="text-xs italic opacity-70">
                        Règles : Seuil 75% | Fenêtre 7 jours | Priorité aux clusters existants
                    </span>
                </p>

                <div className="max-w-xl mb-4">
                    <ArticleSearch
                        label="Article à tester"
                        value={selectedArticle1}
                        onChange={setSelectedArticle1}
                    />
                </div>

                <button
                    onClick={simulateClustering}
                    disabled={!selectedArticle1 || testingSimlarity}
                    className="px-6 py-2 bg-accent text-white rounded-lg font-bold text-sm disabled:opacity-50 flex items-center gap-2"
                >
                    {testingSimlarity ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />}
                    Simuler le Clustering
                </button>

                {simulationResult && (
                    <div className="mt-6 space-y-4">
                        {/* Decision Banner */}
                        <div className={`p-4 rounded-lg border ${simulationResult.decision === 'JOIN_EXISTING'
                            ? 'bg-green-500/10 border-green-500/50'
                            : 'bg-blue-500/10 border-blue-500/50'
                            }`}>
                            <div className="flex items-center gap-3 mb-1">
                                {simulationResult.decision === 'JOIN_EXISTING' ? (
                                    <CheckCircle className="w-6 h-6 text-green-500" />
                                ) : (
                                    <GitBranch className="w-6 h-6 text-blue-500" />
                                )}
                                <span className={`text-lg font-bold ${simulationResult.decision === 'JOIN_EXISTING' ? 'text-green-500' : 'text-blue-500'
                                    }`}>
                                    {simulationResult.decision === 'JOIN_EXISTING'
                                        ? 'Rejoint un cluster existant'
                                        : 'Crée un NOUVEAU cluster'}
                                </span>
                            </div>

                            {simulationResult.targetCluster && (
                                <div className="ml-9 text-sm">
                                    <div className="flex items-center gap-2">
                                        <span>Rejoint le cluster : <span className="font-bold">{simulationResult.targetCluster.label}</span></span>
                                        <span className="text-muted text-xs">({simulationResult.targetCluster.article_count} articles)</span>
                                    </div>

                                    {simulationResult.targetCluster.previewArticles && (
                                        <details className="mt-2 text-xs">
                                            <summary className="cursor-pointer text-muted hover:text-foreground transition-colors font-medium select-none flex items-center gap-1 w-fit">
                                                <ChevronRight className="w-3 h-3 transition-transform group-open:rotate-90" />
                                                Voir les articles de ce cluster
                                            </summary>
                                            <div className="mt-2 pl-4 space-y-1 border-l-2 border-border/50">
                                                {simulationResult.targetCluster.previewArticles.map((a) => (
                                                    <div key={a.id} className="flex items-center gap-2 py-1">
                                                        <ExternalLink className="w-3 h-3 text-muted shrink-0" />
                                                        <span className="truncate opacity-80" title={a.title}>{a.title}</span>
                                                        <span className="text-[10px] text-muted font-mono whitespace-nowrap ml-auto">
                                                            {a.published_at ? formatDistanceToNow(new Date(a.published_at), { addSuffix: true, locale: fr }) : ''}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </details>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Matches Table */}
                        <div className="bg-secondary/20 rounded-lg p-4 border border-border">
                            <h3 className="text-sm font-bold text-muted mb-3 uppercase tracking-wide">
                                Articles Similaires Trouvés ({simulationResult.matches?.length || 0})
                            </h3>

                            {(!simulationResult.matches || simulationResult.matches.length === 0) ? (
                                <p className="text-sm text-muted italic">Aucun article similaire trouvé (&gt; 50%) dans les 7 derniers jours.</p>
                            ) : (
                                <div className="space-y-2">
                                    {simulationResult.matches.map((match: Match) => {
                                        const isWeak = match.matchType === 'weak' || match.similarity < 0.75;
                                        const isTarget = simulationResult.targetCluster && match.cluster?.id === simulationResult.targetCluster.id;
                                        return (
                                            <div
                                                key={match.id}
                                                className={`p-3 rounded border flex items-center justify-between text-sm ${isTarget
                                                    ? 'bg-accent/5 border-accent/30 ring-1 ring-accent/20'
                                                    : isWeak
                                                        ? 'bg-secondary/30 border-border/30 opacity-75'
                                                        : 'bg-card border-border/50 shadow-sm'
                                                    }`}
                                            >
                                                <div className="flex-1 min-w-0 pr-4">
                                                    <div className="flex items-center gap-2">
                                                        <div className="font-medium truncate">
                                                            {match.title}
                                                        </div>
                                                        {isTarget && (
                                                            <span className="text-[10px] bg-accent text-white px-1.5 py-0.5 rounded font-bold uppercase tracking-wider shadow-sm">
                                                                Cible
                                                            </span>
                                                        )}
                                                        {isWeak && (
                                                            <span className="text-[10px] bg-red-500/10 text-red-500 px-1.5 py-0.5 rounded border border-red-500/20 uppercase font-bold tracking-wider">
                                                                Faible
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className="text-xs text-muted">{formatDistanceToNow(new Date(match.published_at), { addSuffix: true, locale: fr })}</span>
                                                        {match.cluster ? (
                                                            <span className="text-[10px] bg-accent/10 text-accent px-1.5 py-0.5 rounded border border-accent/20">
                                                                Cluster: {match.cluster.label}
                                                            </span>
                                                        ) : (
                                                            <span className="text-[10px] bg-secondary text-muted px-1.5 py-0.5 rounded">
                                                                Sans cluster
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="shrink-0 text-right">
                                                    <div className={`font-mono font-bold ${getScoreColor(match.similarity)}`}>
                                                        {(match.similarity * 100).toFixed(1)}%
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>


                        {/* Old location removed */}
                    </div>
                )}
            </div>

            {/* Clusters List */}
            <div className="bg-card border border-border rounded-xl p-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                    <div>
                        <h2 className="text-lg font-bold flex items-center gap-2">
                            <GitBranch className="w-5 h-5 text-accent" />
                            Clusters ({totalClusters})
                        </h2>
                        <p className="text-xs text-muted">Gestion dynamique des clusters</p>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                placeholder="Rechercher..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 pr-3 py-1.5 bg-secondary text-sm rounded-lg border border-border focus:ring-1 focus:ring-accent outline-none w-40 md:w-60"
                            />
                        </div>
                        <div className="relative">
                            <Filter className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                            <select
                                value={filterStatus}
                                onChange={(e) => {
                                    setFilterStatus(e.target.value as 'all' | 'published' | 'unpublished' | 'important');
                                    setPage(1);
                                }}
                                className="pl-9 pr-3 py-1.5 bg-secondary text-sm rounded-lg border border-border focus:ring-1 focus:ring-accent outline-none appearance-none cursor-pointer"
                            >
                                <option value="all">Tous les statuts</option>
                                <option value="published">Publiés</option>
                                <option value="unpublished">Non publiés</option>
                                <option value="important">Importants (Score 7+)</option>
                            </select>
                        </div>
                        <div className="relative">
                            <ListOrdered className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                            <select
                                value={sortBy}
                                onChange={(e) => {
                                    setSortBy(e.target.value as 'date_desc' | 'score_desc' | 'count_desc');
                                    setPage(1);
                                }}
                                className="pl-9 pr-3 py-1.5 bg-secondary text-sm rounded-lg border border-border focus:ring-1 focus:ring-accent outline-none appearance-none cursor-pointer"
                            >
                                <option value="date_desc">Plus récents</option>
                                <option value="score_desc">Meilleur score</option>
                                <option value="count_desc">Plus d&apos;articles</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div className={`space-y-2 transition-opacity duration-200 ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
                    {loading && clusters.length === 0 ? (
                        <div className="flex justify-center py-12">
                            <Loader2 className="w-8 h-8 animate-spin text-accent" />
                        </div>
                    ) : clusters.length === 0 ? (
                        <p className="text-center text-muted py-8">Aucun cluster trouvé</p>
                    ) : (
                        clusters.map((cluster) => (
                            <div key={cluster.id} className="border border-border rounded-lg overflow-hidden">
                                <button
                                    onClick={() => toggleCluster(cluster.id)}
                                    className="w-full flex items-center justify-between p-4 hover:bg-secondary/30 transition-colors text-left"
                                >
                                    <div className="flex items-center gap-3">
                                        {expandedCluster === cluster.id ? (
                                            <ChevronDown className="w-4 h-4 text-muted" />
                                        ) : (
                                            <ChevronRight className="w-4 h-4 text-muted" />
                                        )}
                                        <div>
                                            <p className="font-medium text-sm line-clamp-1">{cluster.label}</p>
                                            <p className="text-xs text-muted">
                                                {formatDistanceToNow(new Date(cluster.created_at), { addSuffix: true, locale: fr })}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className="text-xs bg-secondary px-2 py-1 rounded">
                                            {cluster.article_count} article{cluster.article_count !== 1 ? 's' : ''}
                                        </span>
                                        {cluster.is_published && (
                                            <span className="text-xs bg-green-500/20 text-green-500 px-2 py-1 rounded font-bold">
                                                Publié
                                            </span>
                                        )}
                                        {cluster.final_score && (
                                            <span className="text-xs text-accent font-mono">
                                                {cluster.final_score.toFixed(1)}
                                            </span>
                                        )}
                                    </div>
                                </button>

                                {expandedCluster === cluster.id && (
                                    <div className="border-t border-border bg-secondary/20 p-4">
                                        {loadingClusterArticles ? (
                                            <div className="flex justify-center py-4">
                                                <Loader2 className="w-5 h-5 animate-spin text-accent" />
                                            </div>
                                        ) : clusterArticles.length === 0 ? (
                                            <p className="text-center text-muted text-sm">Aucun article dans ce cluster</p>
                                        ) : (
                                            <div className="space-y-3">
                                                {clusterArticles.map((article: Article, index: number) => (
                                                    <div key={article.id} className="p-3 bg-card rounded-lg border border-border/50">
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <span className="text-[10px] bg-accent/20 text-accent px-2 py-0.5 rounded font-bold">
                                                                        {article.source}
                                                                    </span>
                                                                    {index === 0 && (
                                                                        <span className="text-[10px] bg-green-500/20 text-green-500 px-2 py-0.5 rounded font-bold">
                                                                            Principal
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <h4 className="text-sm font-medium leading-snug">{article.title}</h4>
                                                                {article.score && (
                                                                    <div className="text-[10px] text-muted mt-1">
                                                                        Score: <span className="font-mono text-accent">{article.score.toFixed(1)}</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <a
                                                                href={article.url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-accent hover:text-accent/80 transition-colors shrink-0"
                                                                title="Ouvrir l'article"
                                                            >
                                                                <ExternalLink className="w-4 h-4" />
                                                            </a>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-4 mt-6">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="p-2 rounded hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <span className="text-sm font-medium">
                            Page {page} / {totalPages}
                        </span>
                        <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="p-2 rounded hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>
                )}
            </div>
        </div >
    );
}
