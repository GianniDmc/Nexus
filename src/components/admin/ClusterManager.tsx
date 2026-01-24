'use client';

import { useState, useEffect, useRef } from 'react';
import { GitBranch, ChevronDown, ChevronRight, Loader2, FlaskConical, CheckCircle, XCircle, ExternalLink, Search } from 'lucide-react';
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
    source_name: string;
}

interface SimilarityResult {
    similarity: number;
    wouldCluster: boolean;
    title1: string;
    title2: string;
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

        // Only search if query has length
        if (query.length < 2) {
            setResults([]);
            return;
        }

        const timer = setTimeout(async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/admin/similarity?search=${encodeURIComponent(query)}`);
                const data = await res.json();
                setResults(data.articles || []);
                setIsOpen(true);
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
                            <span className="text-xs text-muted">[{article.source_name}]</span>
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
    const [expandedCluster, setExpandedCluster] = useState<string | null>(null);
    const [clusterArticles, setClusterArticles] = useState<Article[]>([]);
    const [loadingClusterArticles, setLoadingClusterArticles] = useState(false);

    // Similarity tester state
    const [selectedArticle1, setSelectedArticle1] = useState<Article | null>(null);
    const [selectedArticle2, setSelectedArticle2] = useState<Article | null>(null);
    const [testingSimlarity, setTestingSimilarity] = useState(false);
    const [similarityResult, setSimilarityResult] = useState<SimilarityResult | null>(null);

    useEffect(() => {
        fetchClusters();
    }, []);

    const fetchClusters = async () => {
        try {
            const res = await fetch('/api/admin/clusters');
            const data = await res.json();
            setClusters(data.clusters || []);
        } catch (e) {
            console.error('Error fetching clusters', e);
        } finally {
            setLoading(false);
        }
    };

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

    const testSimilarity = async () => {
        if (!selectedArticle1 || !selectedArticle2) return;
        setTestingSimilarity(true);
        setSimilarityResult(null);

        try {
            const res = await fetch('/api/admin/similarity', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ articleId1: selectedArticle1.id, articleId2: selectedArticle2.id })
            });
            const data = await res.json();
            setSimilarityResult(data);
        } catch (e) {
            console.error('Error testing similarity', e);
        } finally {
            setTestingSimilarity(false);
        }
    };

    const getScoreColor = (score: number) => {
        if (score >= 0.8) return 'text-green-500';
        if (score >= 0.7) return 'text-yellow-500';
        return 'text-red-500';
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-accent" />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Similarity Tester */}
            <div className="bg-card border border-border rounded-xl p-6">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                    <FlaskConical className="w-5 h-5 text-accent" />
                    Test de Similarité
                </h2>
                <p className="text-sm text-muted mb-6">
                    Sélectionnez deux articles pour calculer leur score de similarité cosine.
                    <br />
                    <span className="text-xs italic opacity-70">
                        Note: Utilise la même formule mathématique (Cosine Similarity) que le moteur de processing.
                        L'implémentation est en TypeScript ici mais garantit le même résultat.
                    </span>
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <ArticleSearch
                        label="Article 1"
                        value={selectedArticle1}
                        onChange={setSelectedArticle1}
                    />
                    <ArticleSearch
                        label="Article 2"
                        value={selectedArticle2}
                        onChange={setSelectedArticle2}
                    />
                </div>

                <button
                    onClick={testSimilarity}
                    disabled={!selectedArticle1 || !selectedArticle2 || testingSimlarity}
                    className="px-6 py-2 bg-accent text-white rounded-lg font-bold text-sm disabled:opacity-50 flex items-center gap-2"
                >
                    {testingSimlarity ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />}
                    Tester
                </button>

                {similarityResult && (
                    <div className="mt-6 p-4 bg-secondary/50 rounded-lg border border-border">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-sm text-muted">Score de similarité:</span>
                            <span className={`text-3xl font-bold ${getScoreColor(similarityResult.similarity)}`}>
                                {(similarityResult.similarity * 100).toFixed(1)}%
                            </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                            {similarityResult.wouldCluster ? (
                                <>
                                    <CheckCircle className="w-4 h-4 text-green-500" />
                                    <span className="text-green-500">Ces articles seraient regroupés</span>
                                </>
                            ) : (
                                <>
                                    <XCircle className="w-4 h-4 text-red-500" />
                                    <span className="text-red-500">Ces articles NE seraient PAS regroupés</span>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Clusters List */}
            <div className="bg-card border border-border rounded-xl p-6">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                    <GitBranch className="w-5 h-5 text-accent" />
                    Clusters multi-sources ({clusters.filter(c => c.article_count > 1).length})
                </h2>
                <p className="text-xs text-muted mb-4">Affiche uniquement les clusters contenant plus d'un article.</p>

                <div className="space-y-2">
                    {clusters.filter(c => c.article_count > 1).length === 0 ? (
                        <p className="text-center text-muted py-8">Aucun cluster multi-sources</p>
                    ) : (
                        clusters.filter(c => c.article_count > 1).map((cluster) => (
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
                                                {clusterArticles.map((article: any, index: number) => (
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
            </div>
        </div>
    );
}
