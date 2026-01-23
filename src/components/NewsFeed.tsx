'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useSearchParams } from 'next/navigation';
import { Sparkles, ChevronRight, ExternalLink, Filter, ArrowUpDown, Bookmark, Check, Archive, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type SortOption = 'date' | 'score';

// localStorage helpers
const STORAGE_KEYS = {
  READ: 'nexus_read_articles',
  READING_LIST: 'nexus_reading_list',
};

const getStoredSet = (key: string): Set<string> => {
  if (typeof window === 'undefined') return new Set();
  try {
    const stored = localStorage.getItem(key);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
};

const saveStoredSet = (key: string, set: Set<string>) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify([...set]));
};

export default function NewsFeed() {
  const searchParams = useSearchParams();
  const filterMode = searchParams.get('filter') || 'recent'; // 'recent', 'archives', 'saved'

  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState('Tous');
  const [sortBy, setSortBy] = useState<SortOption>('date');

  // User interaction states (localStorage)
  const [readArticles, setReadArticles] = useState<Set<string>>(new Set());
  const [readingList, setReadingList] = useState<Set<string>>(new Set());

  // Load localStorage on mount
  useEffect(() => {
    setReadArticles(getStoredSet(STORAGE_KEYS.READ));
    setReadingList(getStoredSet(STORAGE_KEYS.READING_LIST));
  }, []);

  // Fetch articles
  useEffect(() => {
    async function fetchData() {
      setLoading(true);

      const { data, error } = await supabase
        .from('articles')
        .select('*')
        .eq('is_published', true)
        .not('summary_short', 'is', null)
        .order('published_at', { ascending: false })
        .limit(300); // Fetch enough to cover recent + archives

      if (!error && data) {
        const validArticles = data.filter(article => {
          try {
            const summary = JSON.parse(article.summary_short);
            return summary && summary.tldr;
          } catch {
            return false;
          }
        });

        // Deduplicate by cluster
        const uniqueItems: any[] = [];
        const seenClusters = new Set();

        validArticles.forEach(article => {
          if (article.cluster_id) {
            if (!seenClusters.has(article.cluster_id)) {
              seenClusters.add(article.cluster_id);
              uniqueItems.push(article);
            }
          } else {
            uniqueItems.push(article);
          }
        });

        setItems(uniqueItems);
        if (uniqueItems.length > 0) {
          setSelectedId(uniqueItems[0].id);
        }
      }
      setLoading(false);
    }

    fetchData();
  }, []);

  // Compute categories
  const categories = useMemo(() => {
    const cats = new Set(items.map(i => i.category || 'Général'));
    return ['Tous', ...Array.from(cats)];
  }, [items]);

  // Filter and Sort
  const displayedItems = useMemo(() => {
    let result = [...items];
    const now = Date.now();
    const HOURS_48 = 48 * 60 * 60 * 1000;

    // 0. Search Filter
    const searchQuery = searchParams.get('search')?.toLowerCase();
    if (searchQuery) {
      result = result.filter(i =>
        i.title.toLowerCase().includes(searchQuery) ||
        (i.category && i.category.toLowerCase().includes(searchQuery))
      );
    }

    // 1. Primary Filter (URL param)
    if (filterMode === 'recent') {
      result = result.filter(i => now - new Date(i.published_at).getTime() <= HOURS_48);
    } else if (filterMode === 'archives') {
      result = result.filter(i => now - new Date(i.published_at).getTime() > HOURS_48);
    } else if (filterMode === 'saved') {
      result = result.filter(i => readingList.has(i.id));
    }

    // 2. Category filter
    if (activeCategory !== 'Tous') {
      result = result.filter(i => (i.category || 'Général') === activeCategory);
    }

    // 3. Sort
    if (sortBy === 'score') {
      result.sort((a, b) => (b.final_score || 0) - (a.final_score || 0));
    } else {
      result.sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());
    }

    return result;
  }, [items, activeCategory, filterMode, sortBy, readingList, searchParams]);

  // Toggle Read Status
  const toggleReadStatus = useCallback((id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setReadArticles(prev => {
      const updated = new Set(prev);
      if (updated.has(id)) {
        updated.delete(id); // Mark as unread
      } else {
        updated.add(id); // Mark as read
      }
      saveStoredSet(STORAGE_KEYS.READ, updated);
      return updated;
    });
  }, []);

  // Reading list toggle
  const toggleReadingList = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setReadingList(prev => {
      const updated = new Set(prev);
      if (updated.has(id)) {
        updated.delete(id);
      } else {
        updated.add(id);
      }
      saveStoredSet(STORAGE_KEYS.READING_LIST, updated);
      return updated;
    });
  }, []);

  // Select article (automatically marks as read if not already)
  const selectArticle = useCallback((id: string) => {
    setSelectedId(id);
    setReadArticles(prev => {
      if (!prev.has(id)) {
        const updated = new Set(prev);
        updated.add(id);
        saveStoredSet(STORAGE_KEYS.READ, updated);
        return updated;
      }
      return prev;
    });
  }, []);

  const formatDistanceToNow = (date: Date) => {
    const diff = Date.now() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return `À l'instant`;
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}j`;
  };

  const selectedArticle = items.find(i => i.id === selectedId);
  const unreadCount = displayedItems.filter(i => !readArticles.has(i.id)).length;

  // Title based on filter
  const getPageTitle = () => {
    switch (filterMode) {
      case 'saved': return 'Ma Liste de lecture';
      case 'archives': return 'Archives';
      default: return 'A la une';
    }
  };

  if (loading) return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-8 h-[80vh]">
      <div className="md:col-span-5 space-y-4">
        <div className="h-10 bg-secondary/20 rounded-lg w-full mb-4 animate-pulse" />
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="h-24 bg-secondary/30 rounded-xl animate-pulse" />
        ))}
      </div>
      <div className="hidden md:block md:col-span-7 bg-secondary/10 rounded-2xl animate-pulse" />
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 lg:gap-10 pb-20 items-start">

      {/* LEFT COLUMN: List */}
      <div className="md:col-span-5 flex flex-col h-[calc(100vh-100px)]">

        {/* Controls Header (Sticky) */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur py-4 border-b border-border/40 mb-2 overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-serif font-medium text-primary flex items-center gap-2">
              <Filter className="w-4 h-4 text-accent" />
              {getPageTitle()}
              {unreadCount > 0 && (
                <span className="text-[9px] bg-accent text-white px-1.5 py-0.5 rounded-full">{unreadCount}</span>
              )}
            </h3>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSortBy(sortBy === 'date' ? 'score' : 'date')}
                className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 text-muted hover:text-accent transition-colors"
              >
                <ArrowUpDown className="w-3 h-3" />
                {sortBy === 'date' ? 'Récents' : 'Pertinence'}
              </button>
            </div>
          </div>

          {/* Category Dropdown */}
          <div className="mt-2">
            <div className="relative">
              <select
                value={activeCategory}
                onChange={(e) => setActiveCategory(e.target.value)}
                className="w-full appearance-none bg-secondary/30 border border-border/50 text-foreground text-xs font-medium rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:border-accent/50 transition-all cursor-pointer hover:bg-secondary/50"
              >
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-muted-foreground">
                <Filter className="h-3 w-3" />
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable List */}
        <div className="flex-1 overflow-y-auto no-scrollbar pb-20 space-y-3">
          {displayedItems.length === 0 && (
            <div className="text-center py-10 text-muted italic text-sm">
              {filterMode === 'saved' ? "Votre liste de lecture est vide." : "Aucun article trouvé."}
            </div>
          )}
          {displayedItems.map((article, index) => {
            const isSelected = selectedId === article.id;
            const isRead = readArticles.has(article.id);
            const isSaved = readingList.has(article.id);
            const date = new Date(article.published_at);

            return (
              <div
                key={article.id}
                onClick={() => selectArticle(article.id)}
                className={`group cursor-pointer p-4 rounded-xl border transition-all duration-300 relative ${isSelected
                  ? 'bg-accent/5 border-accent/50 shadow-md ring-1 ring-accent/20'
                  : isRead
                    ? 'bg-card/30 border-border/20 opacity-60'
                    : 'bg-card/50 border-border/40 hover:bg-card hover:border-border'
                  }`}
              >
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center gap-1 mt-1">
                    <div className={`text-xs font-mono font-bold ${isSelected ? 'text-accent' : isRead ? 'text-muted/20' : 'text-muted/30'}`}>
                      {(index + 1).toString().padStart(2, '0')}
                    </div>
                    <button
                      onClick={(e) => toggleReadStatus(article.id, e)}
                      className={`p-0.5 rounded-full transition-colors ${isRead
                        ? 'text-green-500/50 hover:text-green-500 hover:bg-green-500/10'
                        : 'text-transparent hover:text-muted-foreground/30'}`}
                      title={isRead ? "Marquer comme non lu" : "Marquer comme lu"}
                    >
                      <Check className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{article.category || 'Tech'}</span>
                      <span className="text-[9px] text-muted">• {formatDistanceToNow(date)}</span>
                      {sortBy === 'score' && article.final_score > 0 && (
                        <span className="text-[9px] font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                          <Sparkles className="w-2.5 h-2.5" />
                          {article.final_score}/10
                        </span>
                      )}
                    </div>
                    <h4 className={`text-sm font-medium leading-snug ${isRead ? 'text-primary/50' : isSelected ? 'text-primary' : 'text-primary/80'}`}>
                      {article.title}
                    </h4>
                  </div>

                  {/* Bookmark Button */}
                  <button
                    onClick={(e) => toggleReadingList(article.id, e)}
                    className={`p-1.5 rounded-lg transition-all ${isSaved
                      ? 'bg-accent/20 text-accent'
                      : 'text-muted/30 hover:text-accent hover:bg-accent/10'
                      }`}
                    title={isSaved ? "Retirer de ma liste" : "Ajouter à ma liste"}
                  >
                    <Bookmark className={`w-4 h-4 ${isSaved ? 'fill-current' : ''}`} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* RIGHT COLUMN: Preview (Desktop: Sticky, Mobile: Full Screen Overlay) */}
      <AnimatePresence mode="wait">
        {(selectedArticle || (typeof window !== 'undefined' && window.innerWidth >= 768)) && (
          <div className={`
            md:block md:col-span-7 md:sticky md:top-6 md:h-[calc(100vh-100px)] md:overflow-hidden
            ${selectedArticle
              ? 'fixed inset-0 z-50 bg-background md:static md:bg-transparent md:z-auto flex flex-col'
              : 'hidden md:block'}
          `}>
            {/* Mobile Close Button Header */}
            <div className="md:hidden flex items-center justify-between p-4 border-b border-border bg-background/95 backdrop-blur">
              <button
                onClick={() => setSelectedId(null)}
                className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                <ChevronRight className="w-4 h-4 rotate-180" /> Retour
              </button>
              <span className="text-xs font-bold uppercase tracking-widest opacity-50">Lecture</span>
            </div>

            <motion.div
              key={selectedArticle ? selectedArticle.id : 'empty'}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="h-full bg-card border border-border/50 md:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            >
              {selectedArticle ? (
                <>
                  <div className="relative h-48 sm:h-64 flex-shrink-0 flex items-center justify-center overflow-hidden">
                    {selectedArticle.image_url ? (
                      <>
                        <img
                          src={selectedArticle.image_url}
                          alt={selectedArticle.title}
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
                      </>
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-accent/10 to-background flex items-center justify-center">
                        <Sparkles className="w-16 h-16 text-accent/20" />
                      </div>
                    )}

                    <div className="absolute bottom-4 left-6 right-6 flex justify-between items-end z-10">
                      <span className="px-2 py-1 bg-background/80 backdrop-blur rounded text-[10px] font-bold uppercase tracking-wider text-accent border border-accent/20">
                        {selectedArticle.category}
                      </span>
                      <div className="flex gap-2">
                        {selectedArticle.final_score > 7 && (
                          <span className="px-2 py-1 bg-green-500/10 text-green-500 rounded text-[10px] font-bold uppercase tracking-wider border border-green-500/20 flex items-center gap-1 backdrop-blur-sm">
                            <Sparkles className="w-3 h-3" /> Top Info
                          </span>
                        )}

                        {/* Toggle Read Status (Eye) */}
                        <button
                          onClick={(e) => toggleReadStatus(selectedArticle.id, e)}
                          className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border flex items-center gap-1 transition-all backdrop-blur-sm bg-background/80 text-muted border-border/20 hover:border-primary hover:text-primary"
                          title={readArticles.has(selectedArticle.id) ? "Marquer comme non lu" : "Marquer comme lu"}
                        >
                          <EyeOff className="w-3 h-3" />
                          {readArticles.has(selectedArticle.id) ? "Non lu" : "Lu"}
                        </button>

                        <button
                          onClick={(e) => toggleReadingList(selectedArticle.id, e)}
                          className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border flex items-center gap-1 transition-all backdrop-blur-sm ${readingList.has(selectedArticle.id)
                            ? 'bg-accent/10 text-accent border-accent/20'
                            : 'bg-background/80 text-muted border-border/20 hover:border-accent hover:text-accent'
                            }`}
                        >
                          <Bookmark className={`w-3 h-3 ${readingList.has(selectedArticle.id) ? 'fill-current' : ''}`} />
                          {readingList.has(selectedArticle.id) ? 'Sauvegardé' : 'Sauvegarder'}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 md:p-8 overflow-y-auto flex-1 custom-scrollbar pb-24 md:pb-8">
                    <h1 className="text-2xl lg:text-3xl font-serif font-medium text-primary mb-6 leading-tight">
                      {selectedArticle.title}
                    </h1>

                    <div className="prose prose-sm dark:prose-invert prose-p:text-muted-foreground max-w-none">
                      <p className="text-lg leading-relaxed text-foreground/90 mb-8 border-l-2 border-accent pl-4 italic">
                        {JSON.parse(selectedArticle.summary_short).tldr}
                      </p>

                      <div className="space-y-4 text-base leading-relaxed text-foreground/80">
                        {(JSON.parse(selectedArticle.summary_short).full || "").split('\n').map((paragraph: string, i: number) => (
                          paragraph.trim() && <p key={i}>{paragraph}</p>
                        ))}
                      </div>

                      <div className="mt-8 bg-secondary/20 rounded-xl p-5 border border-border/40">
                        <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary mb-3">
                          <Sparkles className="w-4 h-4 text-accent" /> Analyse & Impact
                        </h3>
                        <p className="text-sm leading-relaxed">
                          {JSON.parse(selectedArticle.summary_short).analysis || "Pas d'analyse spécifique disponible."}
                        </p>
                      </div>
                    </div>

                    <div className="mt-8 pt-6 border-t border-border/40 flex justify-between items-center">
                      <span className="text-xs text-muted">
                        Source : {selectedArticle.source_name || "Multiple Sources"}
                      </span>
                      <a
                        href={selectedArticle.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-muted-foreground hover:text-accent transition-colors text-xs font-bold uppercase tracking-widest"
                      >
                        Voir l'original <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                </>
              ) : (
                <div className="h-full flex items-center justify-center text-muted italic">
                  Sélectionnez un article pour lire le contenu.
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
