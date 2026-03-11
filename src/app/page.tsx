import { Suspense } from 'react';
import { getServiceSupabase } from '@/lib/supabase-admin';
import NewsFeed from '@/components/NewsFeed';

// ISR : revalide les données toutes les 60 secondes (au lieu de force-dynamic)
export const revalidate = 60;

export type FeedItem = {
  id: string;
  title: string;
  published_at: string;
  category: string;
  final_score: number | null;
  image_url: string | null;
  source_name: string;
  cluster_id: string;
  summary_short: string;
  source_count: number | null;
};

async function getPublishedClusters(): Promise<FeedItem[]> {
  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from('clusters')
    .select(`
      id, label, final_score, category, image_url, published_on, created_at,
      summaries (title, content_tldr, content_full, content_analysis, source_count, image_url),
      representative_article:articles!representative_article_id (category)
    `)
    .eq('is_published', true)
    .order('published_on', { ascending: false })
    .limit(300);

  if (error || !data) {
    console.error('[RSC] Fetch error:', error);
    return [];
  }

  return data
    .filter(cluster => {
      if (!cluster.summaries) return false;
      if (Array.isArray(cluster.summaries)) return cluster.summaries.length > 0;
      return true;
    })
    .map(cluster => {
      const summary = Array.isArray(cluster.summaries) ? cluster.summaries[0] : cluster.summaries;
      const repArticle = cluster.representative_article as unknown as { category: string } | null;
      const category = cluster.category || repArticle?.category || 'General';

      return {
        id: cluster.id,
        title: (summary as Record<string, unknown>).title as string || cluster.label,
        published_at: cluster.published_on || cluster.created_at,
        category,
        final_score: cluster.final_score,
        image_url: cluster.image_url,
        source_name: 'Nexus Synthesis',
        cluster_id: cluster.id,
        summary_short: JSON.stringify({
          tldr: (summary as Record<string, unknown>).content_tldr,
          full: (summary as Record<string, unknown>).content_full,
          analysis: (summary as Record<string, unknown>).content_analysis,
          isFullSynthesis: true,
          sourceCount: (summary as Record<string, unknown>).source_count,
        }),
        source_count: (summary as Record<string, unknown>).source_count as number | null,
      };
    });
}

export default async function Home() {
  const items = await getPublishedClusters();

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-background">
      {/* Page Header (Fixed height) */}
      <header className="flex-shrink-0 px-4 py-4 md:px-6 md:py-6 border-b border-border/40 bg-background/50 backdrop-blur-sm z-10">
        <h2 className="text-2xl font-serif font-medium text-primary tracking-tight">Le Flux</h2>
        <p className="text-xs text-muted-foreground mt-0.5">L'essentiel de l'actualité tech, en temps réel.</p>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden relative min-h-0">
        <Suspense fallback={
          <div className="flex h-full w-full items-center justify-center">
            <div className="animate-pulse flex flex-col items-center gap-4">
              <div className="h-12 w-12 bg-secondary/30 rounded-full" />
              <div className="h-4 w-32 bg-secondary/30 rounded" />
            </div>
          </div>
        }>
          <NewsFeed initialItems={items} />
        </Suspense>
      </main>
    </div>
  );
}
