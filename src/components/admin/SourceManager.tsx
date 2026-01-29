'use client';

import { useState, useEffect } from 'react';
import { Rss, Plus, Trash2, Power, Globe, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

interface Source {
    id: string;
    name: string;
    url: string;
    category: string;
    is_active: boolean;
    last_fetched_at: string | null;
    articleCount?: number;
}

export function SourceManager() {
    const [sources, setSources] = useState<Source[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Form State
    const [newSource, setNewSource] = useState({
        name: '',
        url: '',
        category: ''
    });

    const fetchSources = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/sources');
            if (!res.ok) throw new Error('Failed to fetch sources');
            const data = await res.json();
            setSources(data.sources || []);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSources();
    }, []);

    const handleAddSource = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newSource.name || !newSource.url || !newSource.category) return;

        setSubmitting(true);
        try {
            const res = await fetch('/api/admin/sources', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newSource)
            });

            if (!res.ok) throw new Error('Failed to add source');

            await fetchSources();
            setNewSource({ name: '', url: '', category: '' });
        } catch (e: any) {
            setError(e.message);
        } finally {
            setSubmitting(false);
        }
    };

    const toggleSource = async (id: string, currentStatus: boolean) => {
        try {
            // Optimistic update
            setSources(prev => prev.map(s => s.id === id ? { ...s, is_active: !currentStatus } : s));

            const res = await fetch('/api/admin/sources', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, is_active: !currentStatus })
            });

            if (!res.ok) {
                // Revert on error
                setSources(prev => prev.map(s => s.id === id ? { ...s, is_active: currentStatus } : s));
                throw new Error('Failed to update source');
            }
        } catch (e: any) {
            setError(e.message);
        }
    };

    const deleteSource = async (id: string) => {
        if (!confirm('Êtes-vous sûr de vouloir supprimer cette source ?')) return;

        try {
            const res = await fetch(`/api/admin/sources?id=${id}`, {
                method: 'DELETE'
            });

            if (!res.ok) throw new Error('Failed to delete source');

            setSources(prev => prev.filter(s => s.id !== id));
        } catch (e: any) {
            setError(e.message);
        }
    };

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <Rss className="w-5 h-5 text-accent" />
                        Sources RSS ({sources.length})
                    </h2>
                    <p className="text-sm text-muted">Gérez les flux RSS ingérés par l&apos;application.</p>
                </div>
            </div>

            {/* Add Source Form */}
            <div className="bg-card border border-border rounded-xl p-6">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted mb-4">Ajouter une source</h3>
                <form onSubmit={handleAddSource} className="flex flex-col md:flex-row gap-4 items-end">
                    <div className="w-full md:flex-1 space-y-2">
                        <label className="text-xs text-muted block">Nom</label>
                        <input
                            type="text"
                            placeholder="Ex: TechCrunch"
                            value={newSource.name}
                            onChange={e => setNewSource(prev => ({ ...prev, name: e.target.value }))}
                            className="w-full p-2 bg-secondary border border-border rounded-lg text-sm focus:ring-2 focus:ring-accent outline-none"
                        />
                    </div>
                    <div className="w-full md:flex-1 space-y-2">
                        <label className="text-xs text-muted block">URL du Flux RSS</label>
                        <input
                            type="url"
                            placeholder="https://..."
                            value={newSource.url}
                            onChange={e => setNewSource(prev => ({ ...prev, url: e.target.value }))}
                            className="w-full p-2 bg-secondary border border-border rounded-lg text-sm focus:ring-2 focus:ring-accent outline-none"
                        />
                    </div>
                    <div className="w-full md:w-48 space-y-2">
                        <label className="text-xs text-muted block">Catégorie</label>
                        <input
                            type="text"
                            placeholder="Ex: Tech"
                            value={newSource.category}
                            onChange={e => setNewSource(prev => ({ ...prev, category: e.target.value }))}
                            className="w-full p-2 bg-secondary border border-border rounded-lg text-sm focus:ring-2 focus:ring-accent outline-none"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={submitting || !newSource.name || !newSource.url}
                        className="w-full md:w-auto px-4 py-2 bg-accent text-white rounded-lg font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2 h-[38px]"
                    >
                        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        Ajouter
                    </button>
                </form>
                {error && (
                    <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-red-500 text-sm">
                        <AlertCircle className="w-4 h-4" />
                        {error}
                    </div>
                )}
            </div>

            {/* Sources List */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
                {loading ? (
                    <div className="flex justify-center py-12">
                        <Loader2 className="w-8 h-8 animate-spin text-accent" />
                    </div>
                ) : sources.length === 0 ? (
                    <div className="text-center py-12 text-muted">
                        Aucun source configurée.
                    </div>
                ) : (
                    <div className="divide-y divide-border">
                        {sources.map((source) => (
                            <div key={source.id} className="p-4 flex items-center justify-between hover:bg-secondary/30 transition-colors group">
                                <div className="flex items-center gap-4 flex-1 min-w-0">
                                    <div className={`w-2 h-2 rounded-full ${source.is_active ? 'bg-green-500' : 'bg-red-500'}`} />

                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h4 className="font-bold truncate">{source.name}</h4>
                                            <span className="text-[10px] px-2 py-0.5 bg-secondary border border-border rounded-full text-muted">
                                                {source.category}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-3 text-xs text-muted mt-1">
                                            <a
                                                href={source.url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="flex items-center gap-1 hover:text-accent truncate"
                                            >
                                                <Globe className="w-3 h-3" /> {source.url}
                                            </a>
                                            <span>•</span>
                                            <span>
                                                {source.articleCount || 0} articles
                                            </span>
                                            {source.last_fetched_at && (
                                                <>
                                                    <span>•</span>
                                                    <span>MàJ {formatDistanceToNow(new Date(source.last_fetched_at), { addSuffix: true, locale: fr })}</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 ml-4">
                                    <button
                                        onClick={() => toggleSource(source.id, source.is_active)}
                                        title={source.is_active ? 'Désactiver' : 'Activer'}
                                        className={`p-2 rounded-lg transition-colors ${source.is_active
                                                ? 'text-green-500 hover:bg-green-500/10'
                                                : 'text-muted hover:bg-secondary hover:text-foreground'
                                            }`}
                                    >
                                        <Power className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => deleteSource(source.id)}
                                        title="Supprimer"
                                        className="p-2 text-muted hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
