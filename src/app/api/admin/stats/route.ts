import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  PUBLICATION_RULES,
  getPublicationConfig,
  getFreshnessCutoff
} from '@/lib/publication-rules';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  // Use centralized config with optional URL overrides
  const pubConfig = getPublicationConfig({
    freshOnly: searchParams.has('freshOnly') ? searchParams.get('freshOnly') !== 'false' : undefined,
    minSources: searchParams.has('minSources') ? parseInt(searchParams.get('minSources')!) : undefined,
    publishThreshold: searchParams.has('minScore') ? parseFloat(searchParams.get('minScore')!) : undefined,
  });

  const bypassRPC = true; // FORCE BYPASS RPC to use new logic (Cluster-Centric)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    // Fallback OR Filtered Mode
    const publishThreshold = pubConfig.publishThreshold;



    // 1. Get Clusters Statistics FIRST (Central source of truth)
    const { data: unscoredClusters } = await supabase
      .from('clusters')
      .select('id')
      .is('final_score', null);

    const unscoredClusterIds = unscoredClusters?.map(c => c.id) || [];
    const pendingScoringClustersCount = unscoredClusterIds.length;

    // -----------------------------------------------------------------------
    // Filter Actionable Clusters (Applying Publication Rules: Freshness & Consensus)
    // -----------------------------------------------------------------------
    const { data: candidateClusters } = await supabase
      .from('clusters')
      .select('id')
      .gte('final_score', publishThreshold)
      .eq('is_published', false);

    let pendingActionableClustersCount = 0;
    let pendingActionableArticlesCount = 0;

    if (candidateClusters && candidateClusters.length > 0) {
      const candidateIdSet = new Set(candidateClusters.map(c => c.id));

      // Fetch ALL clustered articles to avoid URL overflow (HeadersOverflowError) with large ID lists
      const { data: allClusterArticles } = await supabase
        .from('articles')
        .select('cluster_id, source_name, published_at')
        .not('cluster_id', 'is', null)
        .limit(20000);

      // Filter in memory
      const clusterArticles = allClusterArticles?.filter(a => candidateIdSet.has(a.cluster_id)) || [];

      // Group by cluster
      const articlesByCluster: Record<string, any[]> = {};
      clusterArticles?.forEach(a => {
        if (!articlesByCluster[a.cluster_id]) articlesByCluster[a.cluster_id] = [];
        articlesByCluster[a.cluster_id].push(a);
      });

      // Apply Filters
      const freshnessCutoff = pubConfig.freshnessCutoff;

      pendingActionableClustersCount = candidateClusters.filter(c => {
        const articles = articlesByCluster[c.id] || [];
        if (articles.length === 0) return false;

        // 1. Freshness Check
        if (pubConfig.freshOnly) {
          const hasFresh = articles.some(a => new Date(a.published_at).getTime() >= new Date(freshnessCutoff).getTime());
          if (!hasFresh) return false;
        }

        // 2. Consensus Check
        if (pubConfig.minSources > 1) {
          const uniqueSources = new Set(articles.map(a => a.source_name)).size;
          if (uniqueSources < pubConfig.minSources) return false;
        }

        return true;
      }).length;

      // Optimization: filter IDs first, then sum
      const validatedClusterIds = new Set(candidateClusters.filter(c => {
        const articles = articlesByCluster[c.id] || [];
        if (articles.length === 0) return false;
        if (pubConfig.freshOnly && !articles.some(a => new Date(a.published_at).getTime() >= new Date(freshnessCutoff).getTime())) return false;
        if (pubConfig.minSources > 1 && new Set(articles.map(a => a.source_name)).size < pubConfig.minSources) return false;
        return true;
      }).map(c => c.id));

      pendingActionableClustersCount = validatedClusterIds.size;
      pendingActionableArticlesCount = clusterArticles?.filter(a => validatedClusterIds.has(a.cluster_id)).length || 0;
    }

    const { count: publishedClustersCount } = await supabase
      .from('clusters').select('*', { count: 'exact', head: true }).eq('is_published', true);

    const { count: totalClustersCount } = await supabase
      .from('clusters').select('*', { count: 'exact', head: true });

    // Pending Scoring Articles (kept as is)
    // Use INNER JOIN to filter articles belonging to unscored clusters efficiently
    const { count: pendingScoringArticlesCount } = await supabase
      .from('articles')
      .select('cluster_id, clusters!articles_cluster_id_fkey!inner(final_score)', { count: 'exact', head: true })
      .is('clusters.final_score', null);

    // Standard Article Stats
    const [
      totalRes,
      peRes, // Pending Embedding (Articles)
      eRes,  // Embedded (Articles)
      pcRes, // Pending Clustering (Articles)
      cRes,  // Clustered (Articles)
      lastArticleRes // Last Sync
    ] = await Promise.all([
      supabase.from('articles').select('*', { count: 'exact', head: true }),
      supabase.from('articles').select('*', { count: 'exact', head: true }).is('embedding', null),
      supabase.from('articles').select('*', { count: 'exact', head: true }).not('embedding', 'is', null),
      supabase.from('articles').select('*', { count: 'exact', head: true }).not('embedding', 'is', null).is('cluster_id', null),
      supabase.from('articles').select('*', { count: 'exact', head: true }).not('cluster_id', 'is', null),
      supabase.from('articles').select('created_at').order('created_at', { ascending: false }).limit(1).single()
    ]);

    // Relevant / Rejected Clusters
    const { count: relevantClustersCount } = await supabase
      .from('clusters').select('*', { count: 'exact', head: true }).gte('final_score', publishThreshold);

    const { count: rejectedClustersCount } = await supabase
      .from('clusters').select('*', { count: 'exact', head: true }).lt('final_score', publishThreshold).not('final_score', 'is', null);

    const { count: scoredClustersCount } = await supabase
      .from('clusters').select('*', { count: 'exact', head: true }).not('final_score', 'is', null);


    // Multi-Article Clusters: Count clusters with more than 1 article
    const { data: clusterSizes } = await supabase
      .from('articles')
      .select('cluster_id')
      .not('cluster_id', 'is', null);

    const clusterMap: Record<string, number> = {};
    clusterSizes?.forEach((a: { cluster_id: string }) => {
      clusterMap[a.cluster_id] = (clusterMap[a.cluster_id] || 0) + 1;
    });
    const multiArticleClusters = Object.values(clusterMap).filter(count => count > 1).length;

    // Return enriched stats
    return NextResponse.json({
      total: totalRes.count || 0,

      pendingEmbedding: peRes.count || 0,
      embedded: eRes.count || 0,

      pendingClustering: pcRes.count || 0,
      clustered: cRes.count || 0,

      pendingScore: pendingScoringArticlesCount, // UI "Pending Score" (Articles)
      pendingScoring: pendingScoringArticlesCount, // Alias
      pendingScoreClusters: pendingScoringClustersCount, // NEW: Clusters count

      pendingRewriting: pendingActionableArticlesCount, // UI "Actionable" (Articles)
      pendingActionable: pendingActionableArticlesCount, // Alias
      pendingActionableClusters: pendingActionableClustersCount, // NEW: Clusters count

      scored: scoredClustersCount || 0, // Clusters
      relevant: relevantClustersCount || 0, // Clusters
      rejected: rejectedClustersCount || 0, // Clusters

      pendingSkipped: 0,

      ready: pendingActionableArticlesCount,
      published: publishedClustersCount || 0,

      clusterCount: totalClustersCount || 0,
      multiArticleClusters,
      lastSync: lastArticleRes.data?.created_at || null
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
