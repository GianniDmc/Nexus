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
    const publishThreshold = pubConfig.publishThreshold;
    const freshnessCutoff = pubConfig.freshnessCutoff;

    // 1. Define all independent queries
    const independentQueries = [
      // unscoredClustersRes
      supabase.from('clusters').select('id').is('final_score', null),
      // candidateClustersRes
      supabase.from('clusters').select('id').gte('final_score', publishThreshold).eq('is_published', false),
      // allClusterArticlesRes
      supabase.from('articles').select('cluster_id, source_name, published_at').not('cluster_id', 'is', null).limit(20000),
      // publishedClustersRes
      supabase.from('clusters').select('*', { count: 'exact', head: true }).eq('is_published', true),
      // totalClustersRes
      supabase.from('clusters').select('*', { count: 'exact', head: true }),
      // pendingScoringArticlesCountRes
      supabase.from('articles').select('cluster_id, clusters!articles_cluster_id_fkey!inner(final_score)', { count: 'exact', head: true }).is('clusters.final_score', null),
      // totalRes
      supabase.from('articles').select('*', { count: 'exact', head: true }),
      // peRes
      supabase.from('articles').select('*', { count: 'exact', head: true }).is('embedding', null),
      // eRes
      supabase.from('articles').select('*', { count: 'exact', head: true }).not('embedding', 'is', null),
      // pcRes
      supabase.from('articles').select('*', { count: 'exact', head: true }).not('embedding', 'is', null).is('cluster_id', null),
      // cRes
      supabase.from('articles').select('*', { count: 'exact', head: true }).not('cluster_id', 'is', null),
      // lastArticleRes
      supabase.from('articles').select('created_at').order('created_at', { ascending: false }).limit(1).single(),
      // relevantClustersRes
      supabase.from('clusters').select('*', { count: 'exact', head: true }).gte('final_score', publishThreshold),
      // rejectedClustersRes
      supabase.from('clusters').select('*', { count: 'exact', head: true }).lt('final_score', publishThreshold).not('final_score', 'is', null),
      // scoredClustersCountRes
      supabase.from('clusters').select('*', { count: 'exact', head: true }).not('final_score', 'is', null)
    ];

    // 2. Execute all queries in parallel
    const [
      unscoredClustersRes,
      candidateClustersRes,
      allClusterArticlesRes,
      publishedClustersRes,
      totalClustersRes,
      pendingScoringArticlesCountRes,
      totalRes,
      peRes,
      eRes,
      pcRes,
      cRes,
      lastArticleRes,
      relevantClustersRes,
      rejectedClustersRes,
      scoredClustersCountRes
    ] = await Promise.all(independentQueries);

    // 3. Process candidate clusters and articles for publication stats
    const candidateClusters = candidateClustersRes.data || [];
    const allClusterArticles = allClusterArticlesRes.data || [];
    const candidateIdSet = new Set(candidateClusters.map(c => c.id));

    // Group articles by cluster and calculate multi-article clusters in one pass
    const articlesByCluster: Record<string, any[]> = {};
    const clusterMap: Record<string, number> = {};

    allClusterArticles.forEach(a => {
      // For multi-article count
      clusterMap[a.cluster_id] = (clusterMap[a.cluster_id] || 0) + 1;

      // For candidates filtering
      if (candidateIdSet.has(a.cluster_id)) {
        if (!articlesByCluster[a.cluster_id]) articlesByCluster[a.cluster_id] = [];
        articlesByCluster[a.cluster_id].push(a);
      }
    });

    const multiArticleClusters = Object.values(clusterMap).filter(count => count > 1).length;

    // Filter validated clusters based on publication rules
    const validatedClusters = candidateClusters.filter(c => {
      const articles = articlesByCluster[c.id] || [];
      if (articles.length === 0) return false;

      if (pubConfig.freshOnly) {
        const hasFresh = articles.some(a => new Date(a.published_at).getTime() >= new Date(freshnessCutoff).getTime());
        if (!hasFresh) return false;
      }

      if (pubConfig.minSources > 1) {
        const uniqueSources = new Set(articles.map(a => a.source_name)).size;
        if (uniqueSources < pubConfig.minSources) return false;
      }

      return true;
    });

    const pendingActionableClustersCount = validatedClusters.length;
    const validatedClusterIdSet = new Set(validatedClusters.map(c => c.id));
    const pendingActionableArticlesCount = allClusterArticles.filter(a => validatedClusterIdSet.has(a.cluster_id)).length;

    // 4. Return enriched stats
    return NextResponse.json({
      total: totalRes.count || 0,
      pendingEmbedding: peRes.count || 0,
      embedded: eRes.count || 0,
      pendingClustering: pcRes.count || 0,
      clustered: cRes.count || 0,
      pendingScore: pendingScoringArticlesCountRes.count || 0,
      pendingScoring: pendingScoringArticlesCountRes.count || 0,
      pendingScoreClusters: unscoredClustersRes.data?.length || 0,
      pendingRewriting: pendingActionableArticlesCount,
      pendingActionable: pendingActionableArticlesCount,
      pendingActionableClusters: pendingActionableClustersCount,
      scored: scoredClustersCountRes.count || 0,
      relevant: relevantClustersRes.count || 0,
      rejected: rejectedClustersRes.count || 0,
      pendingSkipped: 0,
      ready: pendingActionableArticlesCount,
      published: publishedClustersRes.count || 0,
      clusterCount: totalClustersRes.count || 0,
      multiArticleClusters,
      lastSync: lastArticleRes.data?.created_at || null
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
