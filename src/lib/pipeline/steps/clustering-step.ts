import type { ProcessExecutionContext } from '../process-context';

// Helper: Normalize Source Category to AI Category
function normalizeCategory(sourceCategory: string | null): string {
  if (!sourceCategory) return 'Général';

  const mapping: Record<string, string> = {
    'Tech News': 'Général',
    Apple: 'Mobile',
    Smartphones: 'Mobile',
  };

  return mapping[sourceCategory] || sourceCategory;
}

export async function runClusteringStep(context: ProcessExecutionContext): Promise<void> {
  const { supabase, processingLimit, results, log } = context;
  type SimilarMatch = { cluster_id: string | null };

  while (context.isTimeSafelyRemaining() && !results.stopped) {
    const { data: needsClustering } = await supabase
      .from('articles')
      .select('id, title, embedding, published_at, category')
      .not('embedding', 'is', null)
      .is('cluster_id', null)
      .limit(processingLimit);

    if (needsClustering && needsClustering.length > 0) {
      log(`[CLUSTER] Starting batch of ${needsClustering.length} articles...`);
    }

    if (!needsClustering || needsClustering.length === 0) {
      break;
    }

    let processedInBatch = 0;
    for (const article of needsClustering) {
      if (await context.shouldStop()) {
        results.stopped = true;
        break;
      }
      if (!context.isTimeSafelyRemaining()) {
        results.stopped = true;
        break;
      }

      const { data: matches } = await supabase.rpc('find_similar_articles', {
        query_embedding: article.embedding,
        match_threshold: 0.75,
        match_count: 20,
        anchor_date: article.published_at || new Date().toISOString(),
        window_days: 7,
        exclude_id: article.id,
      });

      const matchRows = Array.isArray(matches) ? (matches as SimilarMatch[]) : [];
      const bestMatchWithCluster = matchRows.find((match) => match.cluster_id);

      if (bestMatchWithCluster) {
        await supabase.from('articles').update({ cluster_id: bestMatchWithCluster.cluster_id }).eq('id', article.id);
      } else {
        const { data: newCluster } = await supabase
          .from('clusters')
          .insert({
            label: article.title,
            category: normalizeCategory(article.category),
          })
          .select()
          .single();
        if (newCluster) {
          await supabase.from('articles').update({ cluster_id: newCluster.id }).eq('id', article.id);
        }
      }
      results.clustered++;
      processedInBatch++;
    }

    if (processedInBatch === 0) break;
    await context.updateProgress(results.clustered, -1, `Clustering: ${results.clustered} traités...`);
  }
}
