import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const freshOnly = searchParams.get('freshOnly') === 'true';
  const minSources = parseInt(searchParams.get('minSources') || '1');
  const bypassRPC = freshOnly || minSources > 1; // Bypass if any filter is active

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
    const applyFilter = (q: any) => {
      if (freshOnly) {
        const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
        return q.gte('published_at', twoDaysAgo);
      }
      return q;
    };

    if (bypassRPC) console.log(`[STATS] Filtered mode(Fresh: ${freshOnly}, MinSrc: ${minSources})...`);

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
      lastArticleResult,
      clusterArticlesResult
    ] = await Promise.all([
      applyFilter(supabase.from('articles').select('*', { count: 'exact', head: true })),
      applyFilter(supabase.from('articles').select('*', { count: 'exact', head: true }).is('embedding', null)),
      applyFilter(supabase.from('articles').select('*', { count: 'exact', head: true }).not('embedding', 'is', null)),
      applyFilter(supabase.from('articles').select('*', { count: 'exact', head: true }).not('embedding', 'is', null).is('cluster_id', null)),
      applyFilter(supabase.from('articles').select('*', { count: 'exact', head: true }).not('cluster_id', 'is', null)),
      applyFilter(supabase.from('articles').select('*', { count: 'exact', head: true }).not('cluster_id', 'is', null).is('relevance_score', null)),
      applyFilter(supabase.from('articles').select('*', { count: 'exact', head: true }).not('relevance_score', 'is', null)),
      applyFilter(supabase.from('articles').select('*', { count: 'exact', head: true }).gte('final_score', 5.5)),
      applyFilter(supabase.from('articles').select('*', { count: 'exact', head: true }).lt('final_score', 5.5).not('final_score', 'is', null)),
      applyFilter(supabase.from('articles').select('*', { count: 'exact', head: true }).not('summary_short', 'is', null).eq('is_published', false).gte('final_score', 5.5)),
      applyFilter(supabase.from('articles').select('*', { count: 'exact', head: true }).eq('is_published', true)),
      supabase.from('clusters').select('*', { count: 'exact', head: true }), // Clusters logic might need check, but articles drive the pipe
      supabase.from('articles').select('created_at').order('created_at', { ascending: false }).limit(1).single(),
      applyFilter(supabase.from('articles').select('cluster_id, source_name').not('cluster_id', 'is', null).gte('final_score', 5.5)) // Optimize for density check
    ]);

    const { data: publishedClusters } = await supabase
      .from('articles')
      .select('cluster_id')
      .eq('is_published', true)
      .not('cluster_id', 'is', null);

    const publishedClusterSet = new Set(publishedClusters?.map(c => c.cluster_id));

    // Aggregate Candidates with Density Check
    let candidatesQuery = supabase
      .from('articles')
      .select('cluster_id, source_name') // Fetch sources
      .gte('final_score', 5.5)
      .is('summary_short', null);

    // Check fresh articles only
    const { data: candidates } = await applyFilter(candidatesQuery);

    // Group by Cluster
    const candidatesByCluster: Record<string, Set<string>> = {};
    candidates?.forEach((c: any) => {
      if (!c.cluster_id) return;
      if (!candidatesByCluster[c.cluster_id]) candidatesByCluster[c.cluster_id] = new Set();
      if (c.source_name) candidatesByCluster[c.cluster_id].add(c.source_name);
    });

    let pendingActionable = 0;
    let pendingSkipped = 0;

    Object.entries(candidatesByCluster).forEach(([cid, sources]) => {
      if (publishedClusterSet.has(cid)) {
        pendingSkipped++;
      } else {
        // FILTER CHECK
        if (sources.size >= minSources) {
          pendingActionable++;
        }
      }
    });

    const clusterCounts: Record<string, number> = {};
    clusterArticlesResult.data?.forEach((a: any) => {
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
