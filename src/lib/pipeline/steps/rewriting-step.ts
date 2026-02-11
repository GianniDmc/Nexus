import { rewriteArticle } from '../../ai';
import { classifyClusterEditorialState } from '../../editorial-state';
import type { ProcessExecutionContext } from '../process-context';

type RewriteCandidate = {
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

async function fetchRewriteCandidates(context: ProcessExecutionContext): Promise<RewriteCandidate[]> {
  const { supabase, pubConfig, results } = context;
  const publishThreshold = pubConfig.publishThreshold;
  const chunkSize = 200;
  const pageSize = 1000;
  const candidateClusters: RewriteCandidate[] = [];

  if (pubConfig.freshOnly) {
    const potentialClusterIds = new Set<string>();
    let freshOffset = 0;

    while (true) {
      if (await context.shouldStop()) {
        results.stopped = true;
        break;
      }

      const { data: freshBatch, error: freshError } = await supabase
        .from('articles')
        .select('cluster_id')
        .gte('published_at', pubConfig.freshnessCutoff)
        .not('cluster_id', 'is', null)
        .range(freshOffset, freshOffset + pageSize - 1);

      if (freshError) throw freshError;
      if (!freshBatch || freshBatch.length === 0) break;

      for (const article of freshBatch) {
        if (article.cluster_id) potentialClusterIds.add(article.cluster_id);
      }

      if (freshBatch.length < pageSize) break;
      freshOffset += pageSize;
    }

    const freshClusterIds = Array.from(potentialClusterIds);
    if (results.stopped) return candidateClusters;

    for (let i = 0; i < freshClusterIds.length; i += chunkSize) {
      if (await context.shouldStop()) {
        results.stopped = true;
        break;
      }
      const batchIds = freshClusterIds.slice(i, i + chunkSize);
      const { data: batchClusters, error: batchError } = await supabase
        .from('clusters')
        .select('id, created_at, final_score, is_published, summary:summaries!summaries_cluster_id_fkey(id)')
        .in('id', batchIds)
        .gte('final_score', publishThreshold)
        .eq('is_published', false)
        .is('summary', null);

      if (batchError) throw batchError;
      if (batchClusters) candidateClusters.push(...(batchClusters as RewriteCandidate[]));
    }

    return candidateClusters;
  }

  let clusterOffset = 0;
  let hasMoreClusters = true;
  while (hasMoreClusters) {
    if (await context.shouldStop()) {
      results.stopped = true;
      break;
    }
    const { data: batchClusters, error: batchError } = await supabase
      .from('clusters')
      .select('id, created_at, final_score, is_published, summary:summaries!summaries_cluster_id_fkey(id)')
      .gte('final_score', publishThreshold)
      .eq('is_published', false)
      .is('summary', null)
      .range(clusterOffset, clusterOffset + pageSize - 1);

    if (batchError) throw batchError;

    if (batchClusters && batchClusters.length > 0) {
      candidateClusters.push(...(batchClusters as RewriteCandidate[]));
      if (batchClusters.length < pageSize) {
        hasMoreClusters = false;
      } else {
        clusterOffset += pageSize;
      }
    } else {
      hasMoreClusters = false;
    }
  }

  return candidateClusters;
}

async function fetchCandidateArticles(
  context: ProcessExecutionContext,
  candidateIds: string[]
): Promise<Record<string, CandidateArticle[]>> {
  const { supabase, results } = context;
  const chunkSize = 200;
  const pageSize = 1000;
  const articlesByCluster: Record<string, CandidateArticle[]> = {};

  for (let i = 0; i < candidateIds.length; i += chunkSize) {
    if (await context.shouldStop()) {
      results.stopped = true;
      break;
    }
    const batchIds = candidateIds.slice(i, i + chunkSize);
    let articleOffset = 0;
    let hasMoreArticles = true;

    while (hasMoreArticles) {
      const { data: articleBatch, error: articleError } = await supabase
        .from('articles')
        .select('cluster_id, source_name, published_at')
        .in('cluster_id', batchIds)
        .range(articleOffset, articleOffset + pageSize - 1);

      if (articleError) throw articleError;

      if (articleBatch && articleBatch.length > 0) {
        for (const article of articleBatch as CandidateArticle[]) {
          if (!article.cluster_id) continue;
          if (!articlesByCluster[article.cluster_id]) {
            articlesByCluster[article.cluster_id] = [];
          }
          articlesByCluster[article.cluster_id].push(article);
        }

        if (articleBatch.length < pageSize) {
          hasMoreArticles = false;
        } else {
          articleOffset += pageSize;
        }
      } else {
        hasMoreArticles = false;
      }
    }
  }

  return articlesByCluster;
}

function selectEligibleClusterIds(context: ProcessExecutionContext, candidateClusters: RewriteCandidate[], articlesByCluster: Record<string, CandidateArticle[]>): string[] {
  const { pubConfig, processingLimit } = context;
  const publishThreshold = pubConfig.publishThreshold;

  return candidateClusters
    .filter((cluster) => {
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

      return classification.state === 'eligible_rewriting';
    })
    .sort((a, b) => (b.final_score ?? -Infinity) - (a.final_score ?? -Infinity))
    .slice(0, processingLimit)
    .map((cluster) => cluster.id);
}

export async function runRewritingStep(context: ProcessExecutionContext): Promise<void> {
  const { supabase, effectiveConfig, llmDelayMs, results, log } = context;

  while (context.isTimeSafelyRemaining() && !results.stopped) {
    const candidateClusters = await fetchRewriteCandidates(context);
    if (results.stopped) break;
    if (candidateClusters.length === 0) {
      log('[REWRITE] No candidate clusters found.');
      break;
    }

    const candidateIds = candidateClusters.map((cluster) => cluster.id);
    const articlesByCluster = await fetchCandidateArticles(context, candidateIds);
    if (results.stopped) break;

    const eligibleClusterIds = selectEligibleClusterIds(context, candidateClusters, articlesByCluster);
    if (eligibleClusterIds.length === 0) {
      log('[REWRITE] No eligible clusters (maturity/sources/freshness constraints).');
      break;
    }

    log(`[REWRITE] Found ${eligibleClusterIds.length} eligible clusters ready for rewriting.`);
    await context.updateProgress(results.rewritten, -1, 'Démarrage rédaction batch...');

    let processedInBatch = 0;
    for (const clusterId of eligibleClusterIds) {
      if (await context.shouldStop()) {
        results.stopped = true;
        break;
      }
      if (!context.isTimeSafelyRemaining()) {
        results.stopped = true;
        break;
      }

      await context.updateProgress(results.rewritten, -1, `Rédaction: ${results.rewritten} publiés...`);
      log(`[REWRITE] Processing cluster ${clusterId.slice(0, 8)}...`);

      const { data: sources } = await supabase
        .from('articles')
        .select('title, content, source_name')
        .eq('cluster_id', clusterId)
        .order('final_score', { ascending: false });

      log(`[REWRITE] Cluster ${clusterId.slice(0, 8)} has ${sources?.length || 0} sources`);

      if (sources && sources.length > 0) {
        let rewritten = null;
        try {
          log(`[REWRITE] Calling rewriteArticle for cluster ${clusterId.slice(0, 8)}...`);
          rewritten = await rewriteArticle(sources, effectiveConfig);
          log(`[REWRITE] rewriteArticle returned: ${rewritten ? 'success' : 'null'}`);
        } catch (error) {
          log(`[REWRITE ERROR] Exception during rewriteArticle: ${error}`);
        }

        if (rewritten && rewritten.title && rewritten.content && rewritten.title.length > 5 && rewritten.content.length > 50) {
          const { data: topArticle } = await supabase
            .from('articles')
            .select('id, final_score, title, image_url')
            .eq('cluster_id', clusterId)
            .order('final_score', { ascending: false })
            .limit(1)
            .single();

          if (topArticle) {
            const { error: insertError } = await supabase
              .from('summaries')
              .upsert(
                {
                  cluster_id: clusterId,
                  title: rewritten.title,
                  content_tldr: rewritten.tldr,
                  content_analysis: rewritten.impact,
                  content_full: rewritten.content,
                  image_url: topArticle.image_url,
                  source_count: sources.length,
                  model_name: effectiveConfig?.preferredProvider || 'auto',
                },
                { onConflict: 'cluster_id' }
              );

            if (!insertError) {
              await supabase
                .from('clusters')
                .update({
                  is_published: true,
                  last_processed_at: new Date().toISOString(),
                  published_on: new Date().toISOString(),
                  label: rewritten.title,
                  image_url: topArticle.image_url,
                  category: rewritten.category,
                })
                .eq('id', clusterId);

              results.rewritten++;
              processedInBatch++;
            }
          }
        } else {
          log(`[REWRITE INVALID] Content invalid or empty for cluster ${clusterId}. Skipping publication.`);
        }

        await context.sleep(llmDelayMs);
      }
    }

    if (processedInBatch === 0) break;
  }
}
