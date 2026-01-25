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
  });

  const bypassRPC = pubConfig.freshOnly || pubConfig.minSources > 1; // Bypass RPC if filters are active

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    // Try to use the SQL function first (most efficient) ONLY if no filter
    let rpcData = null;
    let rpcError = null;

    if (!bypassRPC) {
      const res = await supabase.rpc('get_pipeline_stats');
      rpcData = res.data;
      rpcError = res.error;
    }

    if (!bypassRPC && !rpcError && rpcData) {
      // ... existing RPC logic ...
      const { data: lastArticle } = await supabase
        .from('articles')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      return NextResponse.json({
        ...rpcData,
        pendingScore: rpcData.pendingScoring,
        pendingRewriting: rpcData.relevant - (rpcData.ready || 0) - (rpcData.published || 0),
        pendingActionable: rpcData.relevant - (rpcData.ready || 0) - (rpcData.published || 0),
        pendingSkipped: 0,
        lastSync: lastArticle?.created_at || null
      });
    }

    // Fallback OR Filtered Mode
    const freshnessCutoff = pubConfig.freshnessCutoff;
    const publishThreshold = pubConfig.publishThreshold;

    if (bypassRPC) console.log(`[STATS] Computing stats (Threshold: ${publishThreshold}, Filters apply ONLY to Rédaction)...`);

    // Pipeline stats - NO FILTER applied (show real pipeline state)
    const [
      totalResult,
      pendingEmbeddingResult,
      embeddedResult,
      pendingClusteringResult,
      clusteredResult,
      pendingScoringResult,
      scoredResult,
      relevantResult,
      rejectedResult,
      readyResult,
      publishedResult,
      clusterCountResult,
      lastArticleResult
    ] = await Promise.all([
      supabase.from('articles').select('*', { count: 'exact', head: true }),
      supabase.from('articles').select('*', { count: 'exact', head: true }).is('embedding', null),
      supabase.from('articles').select('*', { count: 'exact', head: true }).not('embedding', 'is', null),
      supabase.from('articles').select('*', { count: 'exact', head: true }).not('embedding', 'is', null).is('cluster_id', null),
      supabase.from('articles').select('*', { count: 'exact', head: true }).not('cluster_id', 'is', null),
      supabase.from('articles').select('*', { count: 'exact', head: true }).not('cluster_id', 'is', null).is('relevance_score', null),
      supabase.from('articles').select('*', { count: 'exact', head: true }).not('relevance_score', 'is', null),
      supabase.from('articles').select('*', { count: 'exact', head: true }).gte('final_score', publishThreshold),
      supabase.from('articles').select('*', { count: 'exact', head: true }).lt('final_score', publishThreshold).not('final_score', 'is', null),
      supabase.from('articles').select('*', { count: 'exact', head: true }).not('summary_short', 'is', null).eq('is_published', false).gte('final_score', publishThreshold),
      supabase.from('articles').select('*', { count: 'exact', head: true }).eq('is_published', true),
      supabase.from('clusters').select('*', { count: 'exact', head: true }),
      supabase.from('articles').select('created_at').order('created_at', { ascending: false }).limit(1).single()
    ]);

    const { data: publishedClusters } = await supabase
      .from('articles')
      .select('cluster_id')
      .eq('is_published', true)
      .not('cluster_id', 'is', null);

    const publishedClusterSet = new Set(publishedClusters?.map(c => c.cluster_id));

    // Get ALL candidate articles (no freshness filter here - we check at cluster level)
    const { data: allCandidates } = await supabase
      .from('articles')
      .select('cluster_id, source_name, published_at')
      .gte('final_score', publishThreshold)
      .is('summary_short', null);

    // Group by Cluster with freshness tracking
    const candidatesByCluster: Record<string, { sources: Set<string>, hasFreshArticle: boolean }> = {};
    allCandidates?.forEach((c: any) => {
      if (!c.cluster_id) return;
      if (!candidatesByCluster[c.cluster_id]) {
        candidatesByCluster[c.cluster_id] = { sources: new Set(), hasFreshArticle: false };
      }
      if (c.source_name) candidatesByCluster[c.cluster_id].sources.add(c.source_name);
      // Check if this article is fresh
      if (c.published_at >= freshnessCutoff) {
        candidatesByCluster[c.cluster_id].hasFreshArticle = true;
      }
    });

    let pendingActionable = 0;
    let pendingSkipped = 0;

    Object.entries(candidatesByCluster).forEach(([cid, data]) => {
      if (publishedClusterSet.has(cid)) {
        pendingSkipped++;
      } else {
        // Check freshness at CLUSTER level (same logic as process/route.ts)
        if (pubConfig.freshOnly && !data.hasFreshArticle) {
          return; // Skip cluster without fresh articles
        }
        // Check min sources
        if (data.sources.size >= pubConfig.minSources) {
          pendingActionable++;
        }
      }
    });

    // Count multi-article clusters using allCandidates data
    const clusterCounts: Record<string, number> = {};
    allCandidates?.forEach((a: any) => {
      if (a.cluster_id) clusterCounts[a.cluster_id] = (clusterCounts[a.cluster_id] || 0) + 1;
    });
    const multiArticleClusters = Object.values(clusterCounts).filter(c => c > 1).length;

    return NextResponse.json({
      total: totalResult.count || 0,
      pendingScore: pendingScoringResult.count || 0,
      pendingEmbedding: pendingEmbeddingResult.count || 0,
      embedded: embeddedResult.count || 0,
      pendingClustering: pendingClusteringResult.count || 0,
      clustered: clusteredResult.count || 0,
      pendingScoring: pendingScoringResult.count || 0,
      pendingRewriting: pendingActionable,
      scored: scoredResult.count || 0,
      relevant: relevantResult.count || 0,
      rejected: rejectedResult.count || 0,
      pendingActionable,
      pendingSkipped,
      ready: readyResult.count || 0,
      published: publishedResult.count || 0,
      clusterCount: clusterCountResult.count || 0,
      multiArticleClusters,
      lastSync: lastArticleResult.data?.created_at || null
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
