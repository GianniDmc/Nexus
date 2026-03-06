import type { ProcessExecutionContext } from '../process-context';

// Seuil de cohérence pour rejoindre un cluster existant.
// Plus élevé que le seuil de recherche (0.75) pour éviter la transitivité :
// un article doit être fortement similaire à au moins un article du cluster cible.
const CLUSTER_COHERENCE_THRESHOLD = 0.80;

type SimilarMatch = {
  id: string;
  similarity: number;
  cluster_id: string | null;
};

// Sélection du meilleur cluster parmi les matches similaires.
// Groupe par cluster, retient celui avec la meilleure similarité max,
// départagé par le nombre de matches dans ce cluster.
function selectBestCluster(matchRows: SimilarMatch[]): { clusterId: string; bestSimilarity: number } | null {
  const clusterMap = new Map<string, { bestSimilarity: number; matchCount: number }>();

  for (const match of matchRows) {
    if (!match.cluster_id) continue;

    const entry = clusterMap.get(match.cluster_id);
    if (entry) {
      entry.bestSimilarity = Math.max(entry.bestSimilarity, match.similarity);
      entry.matchCount++;
    } else {
      clusterMap.set(match.cluster_id, {
        bestSimilarity: match.similarity,
        matchCount: 1,
      });
    }
  }

  // Filtrer les clusters dont la meilleure similarité dépasse le seuil de cohérence
  let bestClusterId: string | null = null;
  let bestScore = -1;
  let bestCount = 0;

  for (const [clusterId, entry] of clusterMap) {
    if (entry.bestSimilarity < CLUSTER_COHERENCE_THRESHOLD) continue;

    // Départage : meilleure similarité d'abord, puis nombre de matches
    if (
      entry.bestSimilarity > bestScore ||
      (entry.bestSimilarity === bestScore && entry.matchCount > bestCount)
    ) {
      bestClusterId = clusterId;
      bestScore = entry.bestSimilarity;
      bestCount = entry.matchCount;
    }
  }

  return bestClusterId ? { clusterId: bestClusterId, bestSimilarity: bestScore } : null;
}

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
      const bestCluster = selectBestCluster(matchRows);

      if (bestCluster) {
        await supabase.from('articles').update({ cluster_id: bestCluster.clusterId }).eq('id', article.id);
      } else {
        // Aucun cluster existant ne dépasse le seuil de cohérence → nouveau cluster
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
