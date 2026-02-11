import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase-admin';
import { getPublicationConfig } from '@/lib/publication-rules';
import {
  classifyClusterEditorialState,
  isMaturityState,
  isSourceState,
  type EditorialState,
} from '@/lib/editorial-state';

export const dynamic = 'force-dynamic';

type CandidateCluster = {
  id: string;
  created_at: string;
  final_score: number | null;
  is_published: boolean;
  summary: { id: string }[] | null;
};

type CandidateArticle = {
  cluster_id: string | null;
  source_name: string | null;
  published_at: string | null;
};

type Bucket = { clusters: number; articles: number };

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const minSourcesRaw = searchParams.get('minSources');
  const minScoreRaw = searchParams.get('minScore');
  const minSourcesParsed = minSourcesRaw !== null ? parseInt(minSourcesRaw, 10) : undefined;
  const minScoreParsed = minScoreRaw !== null ? parseFloat(minScoreRaw) : undefined;

  const pubConfig = getPublicationConfig({
    freshOnly: searchParams.has('freshOnly') ? searchParams.get('freshOnly') !== 'false' : undefined,
    minSources: Number.isFinite(minSourcesParsed) ? minSourcesParsed : undefined,
    publishThreshold: Number.isFinite(minScoreParsed) ? minScoreParsed : undefined,
    ignoreMaturity: searchParams.has('ignoreMaturity') ? searchParams.get('ignoreMaturity') === 'true' : undefined,
  });

  const supabase = getServiceSupabase();

  try {
    const publishThreshold = pubConfig.publishThreshold;

    // 1. Core counters (article + cluster pipeline state)
    const [
      unscoredClustersRes,
      publishedClustersRes,
      publishedRelevantClustersRes,
      summaryBlockedClustersRes,
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
      scoredClustersCountRes,
      pipelineStatsRes,
    ] = await Promise.all([
      supabase.from('clusters').select('*', { count: 'exact', head: true }).is('final_score', null),
      supabase.from('clusters').select('*', { count: 'exact', head: true }).eq('is_published', true),
      supabase.from('clusters').select('*', { count: 'exact', head: true }).eq('is_published', true).gte('final_score', publishThreshold),
      supabase
        .from('clusters')
        .select('id, summary:summaries!summaries_cluster_id_fkey(id)', { count: 'exact', head: true })
        .eq('is_published', false)
        .gte('final_score', publishThreshold)
        .not('summary', 'is', null),
      supabase.from('clusters').select('*', { count: 'exact', head: true }),
      supabase
        .from('articles')
        .select('cluster_id, clusters!articles_cluster_id_fkey!inner(final_score)', { count: 'exact', head: true })
        .is('clusters.final_score', null),
      supabase.from('articles').select('*', { count: 'exact', head: true }),
      supabase.from('articles').select('*', { count: 'exact', head: true }).is('embedding', null),
      supabase.from('articles').select('*', { count: 'exact', head: true }).not('embedding', 'is', null),
      supabase.from('articles').select('*', { count: 'exact', head: true }).not('embedding', 'is', null).is('cluster_id', null),
      supabase.from('articles').select('*', { count: 'exact', head: true }).not('cluster_id', 'is', null),
      supabase.from('articles').select('created_at').order('created_at', { ascending: false }).limit(1).single(),
      supabase.from('clusters').select('*', { count: 'exact', head: true }).gte('final_score', publishThreshold),
      supabase.from('clusters').select('*', { count: 'exact', head: true }).lt('final_score', publishThreshold).not('final_score', 'is', null),
      supabase.from('clusters').select('*', { count: 'exact', head: true }).not('final_score', 'is', null),
      supabase.rpc('get_pipeline_stats'),
    ] as const);

    // 2. Fetch all rewrite-candidate clusters (high-score, unpublished, no summary)
    const candidateClusters: CandidateCluster[] = [];
    const pageSize = 1000;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const { data: batch, error } = await supabase
        .from('clusters')
        .select('id, created_at, final_score, is_published, summary:summaries!summaries_cluster_id_fkey(id)')
        .gte('final_score', publishThreshold)
        .eq('is_published', false)
        .is('summary', null)
        .range(offset, offset + pageSize - 1);

      if (error) throw error;

      if (batch && batch.length > 0) {
        candidateClusters.push(...(batch as CandidateCluster[]));
        if (batch.length < pageSize) {
          hasMore = false;
        } else {
          offset += pageSize;
        }
      } else {
        hasMore = false;
      }
    }

    const candidateIds = candidateClusters.map((cluster) => cluster.id);
    const articlesByCluster: Record<string, CandidateArticle[]> = {};

    // 3. Fetch all articles for candidate clusters (paginated per chunk to avoid 1000 row cap)
    const chunkSize = 200;
    for (let i = 0; i < candidateIds.length; i += chunkSize) {
      const batchIds = candidateIds.slice(i, i + chunkSize);
      let articleOffset = 0;
      let moreArticles = true;

      while (moreArticles) {
        const { data: articleBatch, error } = await supabase
          .from('articles')
          .select('cluster_id, source_name, published_at')
          .in('cluster_id', batchIds)
          .range(articleOffset, articleOffset + pageSize - 1);

        if (error) throw error;

        if (articleBatch && articleBatch.length > 0) {
          for (const article of articleBatch as CandidateArticle[]) {
            if (!article.cluster_id) continue;
            if (!articlesByCluster[article.cluster_id]) {
              articlesByCluster[article.cluster_id] = [];
            }
            articlesByCluster[article.cluster_id].push(article);
          }

          if (articleBatch.length < pageSize) {
            moreArticles = false;
          } else {
            articleOffset += pageSize;
          }
        } else {
          moreArticles = false;
        }
      }
    }

    // 4. Classify using the single source of truth
    const buckets = new Map<EditorialState, Bucket>();
    const ensureBucket = (state: EditorialState): Bucket => {
      const current = buckets.get(state);
      if (current) return current;
      const created = { clusters: 0, articles: 0 };
      buckets.set(state, created);
      return created;
    };

    for (const cluster of candidateClusters) {
      const articles = articlesByCluster[cluster.id] || [];
      const classification = classifyClusterEditorialState(
        {
          created_at: cluster.created_at,
          final_score: cluster.final_score,
          is_published: cluster.is_published,
          has_summary: Array.isArray(cluster.summary) ? cluster.summary.length > 0 : false,
          articles: articles.map((article) => ({
            source_name: article.source_name,
            published_at: article.published_at,
          })),
        },
        {
          minScore: publishThreshold,
          minSources: pubConfig.minSources,
          freshOnly: pubConfig.freshOnly,
          freshnessCutoff: pubConfig.freshnessCutoff,
          maturityHours: pubConfig.maturityHours,
          ignoreMaturity: pubConfig.ignoreMaturity,
        }
      );

      const bucket = ensureBucket(classification.state);
      bucket.clusters += 1;
      bucket.articles += classification.metrics.article_count;
    }

    const getBucket = (state: EditorialState): Bucket => buckets.get(state) || { clusters: 0, articles: 0 };

    const rewriting = getBucket('eligible_rewriting');
    const waitingMaturityStates = Array.from(buckets.keys()).filter(isMaturityState);
    const waitingSourcesStates = Array.from(buckets.keys()).filter(isSourceState);

    const waitingMaturity = waitingMaturityStates.reduce(
      (acc, state) => {
        const bucket = getBucket(state);
        acc.clusters += bucket.clusters;
        acc.articles += bucket.articles;
        return acc;
      },
      { clusters: 0, articles: 0 }
    );

    const waitingSources = waitingSourcesStates.reduce(
      (acc, state) => {
        const bucket = getBucket(state);
        acc.clusters += bucket.clusters;
        acc.articles += bucket.articles;
        return acc;
      },
      { clusters: 0, articles: 0 }
    );

    const archived = getBucket('archived');
    const anomalyEmpty = getBucket('anomaly_empty');
    const pipelineStats = pipelineStatsRes.data || {};
    const multiArticleClusters = pipelineStats.multiArticleClusters || 0;
    const publishedRelevantClusters = publishedRelevantClustersRes.count || 0;
    const summaryBlockedClusters = summaryBlockedClustersRes.count || 0;
    const relevantDecomposedClusters =
      publishedRelevantClusters +
      rewriting.clusters +
      waitingMaturity.clusters +
      waitingSources.clusters +
      archived.clusters +
      summaryBlockedClusters +
      anomalyEmpty.clusters;
    const relevantClusters = relevantClustersRes.count || 0;
    const relevantGapClusters = relevantClusters - relevantDecomposedClusters;

    // 5. Return enriched stats
    return NextResponse.json({
      total: totalRes.count || 0,
      pendingEmbedding: peRes.count || 0,
      embedded: eRes.count || 0,
      pendingClustering: pcRes.count || 0,
      clustered: cRes.count || 0,
      pendingScore: pendingScoringArticlesCountRes.count || 0,
      pendingScoring: pendingScoringArticlesCountRes.count || 0,
      pendingScoreClusters: unscoredClustersRes.count || 0,

      pendingRewriting: rewriting.articles,
      pendingActionable: rewriting.articles,
      pendingActionableClusters: rewriting.clusters,

      pendingMaturity: waitingMaturity.articles,
      pendingMaturityClusters: waitingMaturity.clusters,
      pendingSources: waitingSources.articles,
      pendingSourcesClusters: waitingSources.clusters,
      pendingArchived: archived.articles,
      pendingArchivedClusters: archived.clusters,

      scored: scoredClustersCountRes.count || 0,
      relevant: relevantClusters,
      rejected: rejectedClustersRes.count || 0,
      publishedRelevantClusters,
      summaryBlockedClusters,
      anomalyEmptyClusters: anomalyEmpty.clusters,
      relevantDecomposedClusters,
      relevantGapClusters,
      pendingSkipped: 0,
      ready: 0,
      published: publishedClustersRes.count || 0,
      clusterCount: totalClustersRes.count || 0,
      multiArticleClusters,
      lastSync: lastArticleRes.data?.created_at || null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
