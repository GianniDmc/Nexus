import { scoreCluster } from '../../ai';
import type { ProcessExecutionContext } from '../process-context';

export async function runScoringStep(context: ProcessExecutionContext): Promise<void> {
  const { supabase, effectiveConfig, processingLimit, llmDelayMs, results, log } = context;
  type ClusterArticle = { id: string; title: string; content: string; source_name: string };

  while (context.isTimeSafelyRemaining() && !results.stopped) {
    const { data: clustersToScore, error: scoreQueryError } = await supabase
      .from('clusters')
      .select(`
          id,
          articles:articles!articles_cluster_id_fkey (
            id,
            title,
            content,
            source_name
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
    for (const cluster of clustersToScore) {
      if (await context.shouldStop()) {
        results.stopped = true;
        break;
      }
      if (!context.isTimeSafelyRemaining()) {
        break;
      }

      const articles = (Array.isArray(cluster.articles) ? cluster.articles : []) as ClusterArticle[];

      if (articles.length === 0) {
        await supabase.from('clusters').update({ final_score: 0 }).eq('id', cluster.id);
        continue;
      }

      const evaluation = await scoreCluster(articles, effectiveConfig);

      await supabase
        .from('clusters')
        .update({
          final_score: evaluation.score,
          representative_article_id: evaluation.representative_id,
        })
        .eq('id', cluster.id);

      results.scored++;
      processedInBatch++;
      await context.sleep(llmDelayMs);
    }

    if (processedInBatch === 0) break;
  }
}
