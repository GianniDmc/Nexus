import { scoreCluster } from '../../ai';
import type { ProcessExecutionContext } from '../process-context';

export async function runScoringStep(context: ProcessExecutionContext): Promise<void> {
  const { supabase, effectiveConfig, processingLimit, llmDelayMs, results, log } = context;
  type ClusterArticle = { id: string; title: string; content: string; source_name: string; published_at: string | null };

  while (context.isTimeSafelyRemaining() && !results.stopped) {
    const { data: clustersToScore, error: scoreQueryError } = await supabase
      .from('clusters')
      .select(`
          id,
          articles:articles!articles_cluster_id_fkey (
            id,
            title,
            content,
            source_name,
            published_at
          )
        `)
      .is('final_score', null)
      .limit(processingLimit);

    if (clustersToScore && clustersToScore.length > 0) {
      log(`[SCORE] Starting batch of ${clustersToScore.length} clusters...`);
    }

    if (scoreQueryError) {
      log(`Scoring Query Error: ${scoreQueryError}`);
      break;
    }

    if (!clustersToScore || clustersToScore.length === 0) {
      break;
    }

    await context.updateProgress(results.scored, -1, `Scoring: ${results.scored} traités...`);

    let processedInBatch = 0;
    const SCORE_CONCURRENCY = 3;

    for (let i = 0; i < clustersToScore.length; i += SCORE_CONCURRENCY) {
      if (await context.shouldStop()) {
        results.stopped = true;
        break;
      }
      if (!context.isTimeSafelyRemaining()) {
        break;
      }

      const batch = clustersToScore.slice(i, i + SCORE_CONCURRENCY);

      const batchResults = await Promise.allSettled(
        batch.map(async (cluster) => {
          const articles = (Array.isArray(cluster.articles) ? cluster.articles : []) as ClusterArticle[];

          if (articles.length === 0) {
            await supabase.from('clusters').update({ final_score: 0 }).eq('id', cluster.id);
            return false;
          }

          const evaluation = await scoreCluster(articles, effectiveConfig);

          await supabase
            .from('clusters')
            .update({
              final_score: evaluation.score,
              representative_article_id: evaluation.representative_id,
              scoring_details: evaluation.details,
            })
            .eq('id', cluster.id);

          return true;
        })
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value) {
          results.scored++;
          processedInBatch++;
        }
      }

      await context.sleep(llmDelayMs);
    }

    if (processedInBatch === 0) break;
  }
}
