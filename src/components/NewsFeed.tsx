'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useSearchParams } from 'next/navigation';
import { Sparkles, ChevronRight, ExternalLink, Filter, ArrowUpDown, Bookmark, Check, Archive, EyeOff, Newspaper, Eye, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { SwipeableArticleCard } from './SwipeableArticleCard';

type SortOption = 'date' | 'score';

// localStorage helpers
const STORAGE_KEYS = {
  READ: 'nexus_read_articles',
  READING_LIST: 'nexus_reading_list',
};

// Date formatter for headers
const formatDateHeader = (dateStr: string) => {
  const date = new Date(dateStr);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === now.toDateString()) return "Aujourd'hui";
  if (date.toDateString() === yesterday.toDateString()) return "Hier";

  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  }).format(date).replace(/^\w/, c => c.toUpperCase());
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
  const filterMode = searchParams.get('filter') || 'today';
  const categoryParam = searchParams.get('category'); // Get category from URL

  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Check for desktop to disable swipe-to-close on large screens
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const checkDesktop = () => setIsDesktop(window.innerWidth >= 1024);
    checkDesktop();
    window.addEventListener('resize', checkDesktop);
    return () => window.removeEventListener('resize', checkDesktop);
  }, []);

  // Lock body scroll when article detail is open on mobile
  useEffect(() => {
    if (selectedId && !isDesktop) {
      // Save current scroll position
      const scrollY = window.scrollY;
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.documentElement.style.overflow = 'hidden';
    } else {
      // Restore scroll position
      const scrollY = document.body.style.top;
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.documentElement.style.overflow = '';
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || '0') * -1);
      }
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.documentElement.style.overflow = '';
    };
  }, [selectedId, isDesktop]);

  // Animation controls for article panel
  const articlePanelControls = useAnimation();

  // Animate panel in when article is selected
  useEffect(() => {
    if (selectedId) {
      articlePanelControls.start({ x: 0 });
    }
  }, [selectedId, articlePanelControls]);
  const [sortBy, setSortBy] = useState<SortOption>('date');

  // User interaction states (localStorage)
  const [readArticles, setReadArticles] = useState<Set<string>>(new Set());
  const [readingList, setReadingList] = useState<Set<string>>(new Set());

  // Load localStorage on mount
  useEffect(() => {
    setReadArticles(getStoredSet(STORAGE_KEYS.READ));
    setReadingList(getStoredSet(STORAGE_KEYS.READING_LIST));
  }, []);

  // Fetch clusters (published stories)
  const fetchData = useCallback(async () => {
    setLoading(true);

    // New Architecture: Fetch Published Clusters with Summaries
    const { data, error } = await supabase
      .from('clusters')
      .select(`
          *,
          summaries (*),
          representative_article:articles!representative_article_id (category)
        `)
      .eq('is_published', true)
      .order('published_on', { ascending: false })
      .limit(300); // Increased limit for better archives/history coverage

    if (!error && data) {
      // Map clusters to the existing "Article-like" item structure
      const mappedItems = data
        .filter(cluster => {
          if (!cluster.summaries) return false;
          if (Array.isArray(cluster.summaries)) return cluster.summaries.length > 0;
          return true;
        })
        .map(cluster => {
          const summary = Array.isArray(cluster.summaries) ? cluster.summaries[0] : cluster.summaries;
          const category = cluster.category || (cluster.representative_article as any)?.category || 'General';

          return {
            id: cluster.id,
            title: summary.title || cluster.label,
            published_at: cluster.published_on || cluster.created_at,
            category: category,
            final_score: cluster.final_score,
            image_url: cluster.image_url,
            source_name: 'Nexus Synthesis',
            cluster_id: cluster.id,
            summary_short: JSON.stringify({
              tldr: summary.content_tldr,
              full: summary.content_full,
              analysis: summary.content_analysis,
              isFullSynthesis: true,
              sourceCount: summary.source_count
            }),
            source_count: summary.source_count
          };
        });

      setItems(mappedItems);

      // Only select the first item on initial load, not on refresh
      if (mappedItems.length > 0 && typeof window !== 'undefined' && window.innerWidth >= 1024 && items.length === 0) {
        setSelectedId(mappedItems[0].id);
      }
    } else {
      console.error("Fetch error:", error);
    }
    setLoading(false);
  }, []); // Remove items dependency to avoid re-triggering logic unnecessarily

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 1. Base Filter (Time & Search) - Defines available items
  const baseItems = useMemo(() => {
    let result = [...items];
    const now = Date.now();

    // Search Filter
    const searchQuery = searchParams.get('search')?.toLowerCase();
    if (searchQuery) {
      result = result.filter(i =>
        i.title.toLowerCase().includes(searchQuery) ||
        (i.category && i.category.toLowerCase().includes(searchQuery))
      );
    }

    // Time Filter
    if (filterMode === 'today') {
      result = result.filter(i => new Date(i.published_at).toDateString() === new Date().toDateString());
    } else if (filterMode === 'yesterday') {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      result = result.filter(i => new Date(i.published_at).toDateString() === yesterday.toDateString());
    } else if (filterMode === 'week') {
      result = result.filter(i => now - new Date(i.published_at).getTime() <= (7 * 24 * 60 * 60 * 1000));
    } else if (filterMode === 'archives') {
      const lastWeek = new Date(now - 7 * 24 * 60 * 60 * 1000);
      result = result.filter(i => new Date(i.published_at) < lastWeek);
    } else if (filterMode === 'saved') {
      result = result.filter(i => readingList.has(i.id));
    }

    return result;
  }, [items, filterMode, searchParams, readingList]);

  // 2. Compute categories from baseItems (Context-aware counts)
  const categories = useMemo(() => {
    const counts: Record<string, number> = {};
    baseItems.forEach(i => {
      const cat = i.category || 'Général';
      counts[cat] = (counts[cat] || 0) + 1;
    });

    const sortedCats = Object.keys(counts).sort((a, b) => {
      const diff = counts[b] - counts[a];
      if (diff !== 0) return diff;
      return a.localeCompare(b);
    });

    return [
      { name: 'Tous', count: baseItems.length },
      ...sortedCats.map(cat => ({ name: cat, count: counts[cat] }))
    ];
  }, [baseItems]);

  // 3. Display Items (Category Filter + Sort)
  const displayedItems = useMemo(() => {
    let result = [...baseItems];

    if (categoryParam) {
      result = result.filter(i => (i.category || 'Général') === categoryParam);
    }

    if (sortBy === 'score') {
      result.sort((a, b) => (b.final_score || 0) - (a.final_score || 0));
    } else {
      result.sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());
    }

    return result;
  }, [baseItems, categoryParam, sortBy]);

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
  const toggleReadingList = useCallback((id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
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

  // Fetch cluster sources when selected article changes
  const [clusterArticles, setClusterArticles] = useState<any[]>([]);
  const [showSources, setShowSources] = useState(false);

  useEffect(() => {
    async function fetchSources() {
      if (!selectedArticle || !selectedArticle.cluster_id) {
        setClusterArticles([]);
        return;
      }
      const { data } = await supabase
        .from('articles')
        .select('id, title, source_name, source_url, published_at')
        .eq('cluster_id', selectedArticle.cluster_id)
        .order('published_at', { ascending: false });

      if (data) {
        setClusterArticles(data);
      }
    }
    fetchSources();
  }, [selectedArticle?.id, selectedArticle?.cluster_id]);

  const unreadCount = displayedItems.filter(i => !readArticles.has(i.id)).length;

  const getPageTitle = () => {
    switch (filterMode) {
      case 'saved': return 'Ma Liste de lecture';
      case 'week': return 'Cette Semaine';
      case 'archives': return 'Archives';
      case 'saved': return 'Ma Liste de lecture';
      case 'week': return 'Cette Semaine';
      case 'archives': return 'Archives';
      case 'today': return "Aujourd'hui";
      case 'yesterday': return 'Hier';
      default: return 'A la une';
    }
  };

  if (loading) return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="animate-pulse flex flex-col items-center gap-4">
        <div className="h-12 w-12 bg-secondary/30 rounded-full" />
        <div className="h-4 w-32 bg-secondary/30 rounded" />
      </div>
    </div>
  );

  return (
    <div className="h-full w-full grid grid-cols-1 lg:grid-cols-12 overflow-hidden bg-background">

      {/* LEFT COLUMN: List (Scrollable Independent) */}
      <div
        className="lg:col-span-4 flex flex-col h-full overflow-hidden border-r border-border/40 bg-card/20 relative"
        style={{ pointerEvents: selectedId && !isDesktop ? 'none' : 'auto' }}
      >

        {/* Sticky Header with Controls */}
        <div className="flex-shrink-0 bg-background/95 backdrop-blur z-20 border-b border-border/40 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-serif font-medium text-primary flex items-center gap-2">
              <Filter className="w-4 h-4 text-accent" />
              {getPageTitle()}
              {unreadCount > 0 && (
                <span className="text-[9px] bg-accent text-white px-1.5 py-0.5 rounded-full">{unreadCount} non lus</span>
              )}
            </h3>
            <div className="flex items-center gap-3">
              <button
                onClick={() => fetchData()}
                disabled={loading}
                className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 text-muted hover:text-accent transition-colors disabled:opacity-50"
                title="Rafraîchir"
              >
                <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setSortBy(sortBy === 'date' ? 'score' : 'date')}
                className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 text-muted hover:text-accent transition-colors"
                title={sortBy === 'date' ? 'Trier par date' : 'Trier par pertinence'}
              >
                <ArrowUpDown className="w-3 h-3" />
                {sortBy === 'date' ? 'Date' : 'Score'}
              </button>
            </div>
          </div>

          {/* Category Pills */}
          <div className="overflow-x-auto custom-scrollbar pb-2 -mx-4 px-4">
            <div className="flex items-center gap-2">
              {categories.map(cat => {
                const isActive = cat.name === 'Tous' ? !categoryParam : categoryParam === cat.name;
                return (
                  <button
                    key={cat.name}
                    onClick={() => {
                      const params = new URLSearchParams(window.location.search);
                      if (cat.name === 'Tous') params.delete('category');
                      else params.set('category', cat.name);
                      window.history.replaceState(null, '', `?${params.toString()}`);
                    }}
                    className={`
                      whitespace-nowrap px-2.5 py-1 rounded-full text-[11px] font-medium transition-all border flex items-center gap-1
                      ${isActive
                        ? 'bg-accent text-white border-accent shadow-sm'
                        : 'bg-secondary/40 text-muted-foreground border-transparent hover:bg-secondary/60 hover:text-foreground'
                      }
                    `}
                  >
                    <span>{cat.name}</span>
                    <span className={`
                      ml-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full text-[9px] font-bold tabular-nums px-0.5
                      ${isActive
                        ? 'bg-white/20 text-white'
                        : 'bg-muted-foreground/10 text-muted-foreground'
                      }
                    `}>
                      {cat.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Scrollable Items Container */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">

          {/* FEATURED SECTION (For 'today', 'yesterday', 'week' filters and if we have items) */}
          {['today', 'yesterday', 'week'].includes(filterMode) && displayedItems.length > 0 && !searchParams.get('category') && (
            <div className="mb-6">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted mb-3 flex items-center gap-2">
                <Sparkles className="w-3 h-3 text-accent" />
                <span>À la Une</span>
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Hero Article (#1) */}
                {(() => {
                  // Calculate top articles strictly for display
                  // Logic: Score * 1.5 + SourceCount * 0.5
                  const featuredCandidates = [...displayedItems].sort((a, b) => {
                    const scoreA = (a.final_score || 0) * 1.5 + (a.source_count || 1) * 0.5;
                    const scoreB = (b.final_score || 0) * 1.5 + (b.source_count || 1) * 0.5;
                    return scoreB - scoreA;
                  });

                  const top3 = featuredCandidates.slice(0, 3);
                  const hero = top3[0];
                  const others = top3.slice(1);

                  if (!hero) return null;

                  return (
                    <>
                      {/* Hero Article (#1) */}
                      <SwipeableArticleCard
                        variant="hero"
                        article={hero}
                        index={0}
                        isSelected={selectedId === hero.id}
                        isRead={readArticles.has(hero.id)}
                        isSaved={readingList.has(hero.id)}
                        sortBy={sortBy}
                        onClick={() => selectArticle(hero.id)}
                        onSwipeLeft={() => toggleReadStatus(hero.id)}
                        onSwipeRight={() => toggleReadingList(hero.id)}
                      />

                      {/* Sub Featured (#2 & #3) - Compact Row Layout */}
                      {others.map((article, idx) => (
                        <SwipeableArticleCard
                          key={article.id}
                          variant="compact"
                          article={article}
                          index={idx + 1}
                          isSelected={selectedId === article.id}
                          isRead={readArticles.has(article.id)}
                          isSaved={readingList.has(article.id)}
                          sortBy={sortBy}
                          onClick={() => selectArticle(article.id)}
                          onSwipeLeft={() => toggleReadStatus(article.id)}
                          onSwipeRight={() => toggleReadingList(article.id)}
                        />
                      ))}
                    </>
                  );
                })()}
              </div>
              <div className="my-6 border-b border-border/40" />
            </div>
          )}

          {/* Standard List */}
          {displayedItems.length === 0 ? (
            <div className="text-center py-10 text-muted italic text-sm">
              {filterMode === 'saved' ? "Votre liste de lecture est vide." : "Aucun article trouvé."}
            </div>
          ) : (
            <div className="space-y-3">
              {['today', 'yesterday', 'week'].includes(filterMode) && !searchParams.get('category') && <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted mb-2 px-1">Le flux continu</h4>}

              {(() => {
                // Remove top 3 from list ONLY if we showed the featured section
                let listItems = displayedItems;
                if (['today', 'yesterday', 'week'].includes(filterMode) && !searchParams.get('category')) {
                  const featuredCandidates = [...displayedItems].sort((a, b) => {
                    const scoreA = (a.final_score || 0) * 1.5 + (a.source_count || 1) * 0.5;
                    const scoreB = (b.final_score || 0) * 1.5 + (b.source_count || 1) * 0.5;
                    return scoreB - scoreA;
                  });
                  const top3Ids = new Set(featuredCandidates.slice(0, 3).map(i => i.id));
                  listItems = displayedItems.filter(i => !top3Ids.has(i.id));
                }

                return listItems.map((article, index) => {
                  const isSelected = selectedId === article.id;
                  const isRead = readArticles.has(article.id);
                  const isSaved = readingList.has(article.id);

                  const prevArticle = index > 0 ? listItems[index - 1] : null;
                  const showDateHeader = !prevArticle ||
                    new Date(article.published_at).toDateString() !== new Date(prevArticle.published_at).toDateString();

                  return (
                    <div key={article.id}>
                      {showDateHeader && filterMode !== 'today' && (
                        <div className="sticky top-0 z-10 bg-background/90 backdrop-blur px-2 py-1.5 mb-2 -mx-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 border-b border-border/30">
                          {formatDateHeader(article.published_at)}
                        </div>
                      )}

                      <SwipeableArticleCard
                        article={article}
                        index={index}
                        isSelected={isSelected}
                        isRead={isRead}
                        isSaved={isSaved}
                        sortBy={sortBy}
                        onClick={() => selectArticle(article.id)}
                        onSwipeLeft={() => toggleReadStatus(article.id)}
                        onSwipeRight={() => toggleReadingList(article.id)}
                      />
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: Article (Full Height Scrollable) */}
      <AnimatePresence mode="wait">
        {(selectedArticle || (typeof window !== 'undefined' && window.innerWidth >= 1024)) && (
          <motion.div
            initial={{ x: '100%' }}
            animate={articlePanelControls}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            drag={isDesktop ? false : "x"}
            dragConstraints={{ left: 0 }}
            dragElastic={0.05}
            onDragStart={() => {
              // Ensure we start from x: 0
              articlePanelControls.set({ x: 0 });
            }}
            onDragEnd={(_, info) => {
              // Close if dragged more than 100px OR if flicked fast enough
              if (info.offset.x > 100 || info.velocity.x > 500) {
                articlePanelControls.start({ x: '100%' }).then(() => {
                  setSelectedId(null);
                });
              } else {
                // Snap back to origin
                articlePanelControls.start({ x: 0 });
              }
            }}
            style={{ touchAction: isDesktop ? 'auto' : 'none' }}
            className={`
            lg:col-span-8 h-full overflow-hidden flex flex-col bg-background shadow-2xl lg:shadow-none
            ${selectedArticle ? 'fixed inset-0 z-[100] lg:static lg:z-auto lg:relative' : 'hidden lg:flex lg:relative'}
          `}>
            {/* Mobile Close Button */}
            <div className="lg:hidden flex-shrink-0 flex items-center justify-between p-4 border-b border-border bg-background/95 backdrop-blur z-50">
              <button onClick={() => setSelectedId(null)} className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <ChevronRight className="w-4 h-4 rotate-180" /> Retour
              </button>
            </div>

            {selectedArticle ? (
              <div className="flex-1 w-full overflow-y-auto custom-scrollbar" style={{ touchAction: 'pan-y' }}>
                {/* Article Hero Image */}
                <div className="relative h-48 md:h-80 w-full flex-shrink-0 overflow-hidden">
                  {selectedArticle.image_url ? (
                    <>
                      <img src={selectedArticle.image_url} alt={selectedArticle.title} className="absolute inset-0 w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
                    </>
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-accent/10 to-background flex items-center justify-center">
                      <Sparkles className="w-20 h-20 text-accent/20" />
                    </div>
                  )}

                  <div className="absolute bottom-6 left-6 right-6 flex justify-between items-end z-10">
                    <div className="flex items-center gap-3">
                      <span className="px-2.5 py-1 bg-background/80 backdrop-blur rounded-md text-[10px] font-bold uppercase tracking-wider text-accent border border-accent/20 shadow-sm">
                        {selectedArticle.category}
                      </span>
                    </div>

                    <div className="flex gap-2">
                      <button onClick={(e) => toggleReadStatus(selectedArticle.id, e)} className={`p-2 bg-background/60 backdrop-blur rounded-full hover:bg-background transition-all border border-transparent hover:border-border ${readArticles.has(selectedArticle.id) ? 'text-primary' : 'text-muted-foreground hover:text-primary'}`} title={readArticles.has(selectedArticle.id) ? "Marquer non-lu" : "Marquer lu"}>
                        {readArticles.has(selectedArticle.id) ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      <button onClick={(e) => toggleReadingList(selectedArticle.id, e)} className={`p-2 bg-background/60 backdrop-blur rounded-full hover:bg-background transition-all border border-transparent hover:border-border ${readingList.has(selectedArticle.id) ? 'text-accent' : 'text-muted-foreground hover:text-accent'}`} title="Sauvegarder">
                        <Bookmark className={`w-4 h-4 ${readingList.has(selectedArticle.id) ? 'fill-current' : ''}`} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Content Container */}
                <div className="max-w-4xl mx-auto p-6 md:p-10 lg:p-14 pb-32">
                  <h1 className="text-2xl md:text-4xl font-serif font-medium text-primary mb-8 leading-tight">
                    {selectedArticle.title}
                  </h1>

                  <div className="prose prose-lg dark:prose-invert prose-headings:font-serif prose-p:text-muted-foreground/90 max-w-none">
                    <p className="text-xl md:text-2xl leading-relaxed text-foreground/90 mb-10 border-l-4 border-accent pl-6 italic font-serif">
                      {JSON.parse(selectedArticle.summary_short).tldr}
                    </p>

                    <div className="space-y-6 text-lg leading-relaxed text-foreground/85">
                      {(JSON.parse(selectedArticle.summary_short).full || "").split('\n').map((paragraph: string, i: number) => (
                        paragraph.trim() && <p key={i}>{paragraph}</p>
                      ))}
                    </div>

                    <div className="mt-12 bg-secondary/30 rounded-2xl p-6 border border-border/50">
                      <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary mb-4">
                        <Sparkles className="w-4 h-4 text-accent" /> Analyse & Impact
                      </h3>
                      <p className="text-base leading-relaxed text-muted-foreground">
                        {JSON.parse(selectedArticle.summary_short).analysis || "Pas d'analyse spécifique disponible."}
                      </p>
                    </div>
                  </div>

                  {/* Premium Sources Footer */}
                  <div className="mt-16 border-t border-border/40 pt-10">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-sm font-bold uppercase tracking-widest text-primary/80 flex items-center gap-2">
                        Couverture Complète
                        <span className="bg-secondary px-2 py-0.5 rounded-full text-[10px]">{clusterArticles.length} sources</span>
                      </h3>
                    </div>

                    {/* Always visible grid of sources (or collapsible if preferred, kept visible for 'full coverage' feel) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {clusterArticles.map((article) => (
                        <a
                          key={article.id}
                          href={article.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group block bg-card/40 hover:bg-secondary/30 p-4 rounded-xl border border-border/40 hover:border-accent/40 transition-all"
                        >
                          <h4 className="text-sm font-medium text-foreground/90 group-hover:text-primary leading-snug mb-2 line-clamp-2">
                            {article.title}
                          </h4>
                          <div className="flex items-center justify-between mt-3">
                            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                              <span className="text-accent">{article.source_name}</span>
                              <span className="w-1 h-1 bg-muted-foreground rounded-full" />
                              <span>{formatDistanceToNow(new Date(article.published_at))}</span>
                            </div>
                            <ExternalLink className="w-3 h-3 text-muted-foreground/40 group-hover:text-accent transition-colors" />
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full w-full flex flex-col items-center justify-center text-muted-foreground/50 bg-card/5 animate-pulse">
                <div className="w-24 h-24 rounded-full bg-secondary/20 mb-4 flex items-center justify-center">
                  <Sparkles className="w-10 h-10 opacity-20" />
                </div>
                <p className="text-sm font-medium">Sélectionnez un article pour commencer la lecture</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
