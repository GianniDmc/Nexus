import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    // Try to use the SQL function first (most efficient)
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_pipeline_stats');

    if (!rpcError && rpcData) {
      // Add lastSync separately
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

    // Fallback to parallel count queries if function doesn't exist
    console.warn('[STATS] SQL function not found, using fallback. Run the migration to enable.');

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
      supabase.from('articles').select('*', { count: 'exact', head: true }),
      supabase.from('articles').select('*', { count: 'exact', head: true }).is('embedding', null),
      supabase.from('articles').select('*', { count: 'exact', head: true }).not('embedding', 'is', null),
      supabase.from('articles').select('*', { count: 'exact', head: true }).not('embedding', 'is', null).is('cluster_id', null),
      supabase.from('articles').select('*', { count: 'exact', head: true }).not('cluster_id', 'is', null),
      supabase.from('articles').select('*', { count: 'exact', head: true }).not('cluster_id', 'is', null).is('relevance_score', null),
      supabase.from('articles').select('*', { count: 'exact', head: true }).not('relevance_score', 'is', null),
      supabase.from('articles').select('*', { count: 'exact', head: true }).gte('final_score', 5.5),
      supabase.from('articles').select('*', { count: 'exact', head: true }).lt('final_score', 5.5).not('final_score', 'is', null),
      supabase.from('articles').select('*', { count: 'exact', head: true }).not('summary_short', 'is', null).eq('is_published', false).gte('final_score', 5.5),
      supabase.from('articles').select('*', { count: 'exact', head: true }).eq('is_published', true),
      supabase.from('clusters').select('*', { count: 'exact', head: true }),
      supabase.from('articles').select('created_at').order('created_at', { ascending: false }).limit(1).single(),
      supabase.from('articles').select('cluster_id').not('cluster_id', 'is', null).range(0, 9999)
    ]);

    const { data: publishedClusters } = await supabase
      .from('articles')
      .select('cluster_id')
      .eq('is_published', true)
      .not('cluster_id', 'is', null);

    const publishedClusterSet = new Set(publishedClusters?.map(c => c.cluster_id));

    const { data: candidates } = await supabase
      .from('articles')
      .select('cluster_id')
      .gte('final_score', 5.5)
      .is('summary_short', null);

    let pendingActionable = 0;
    let pendingSkipped = 0;
    candidates?.forEach(c => {
      if (c.cluster_id && publishedClusterSet.has(c.cluster_id)) {
        pendingSkipped++;
      } else {
        pendingActionable++;
      }
    });

    const clusterCounts: Record<string, number> = {};
    clusterArticlesResult.data?.forEach(a => {
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
