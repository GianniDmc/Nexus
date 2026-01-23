import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  scoreArticleRelevance,
  scoreBatchArticles,
  rewriteArticle,
  generateEmbedding,
  computeFinalScore
} from '@/lib/ai';

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const publishThreshold = 4.0;
  const llmDelayMs = 350;
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const todayDate = new Date().toISOString().slice(0, 10);

  try {
    const { data: needsEmbedding } = await supabase
      .from('articles')
      .select('id, title')
      .is('embedding', null)
      .order('published_at', { ascending: false })
      .limit(10);

    if (needsEmbedding && needsEmbedding.length > 0) {
      for (const article of needsEmbedding) {
        const embedding = await generateEmbedding(article.title);
        if (embedding) {
          await supabase.from('articles').update({ embedding }).eq('id', article.id);
        }
      }
    }

    const { data: needsClustering } = await supabase
      .from('articles')
      .select('id, title, embedding')
      .not('embedding', 'is', null)
      .is('cluster_id', null)
      .limit(10);

    if (needsClustering && needsClustering.length > 0) {
      for (const article of needsClustering) {
        const { data: match } = await supabase.rpc('find_similar_articles', {
          query_embedding: article.embedding,
          match_threshold: 0.78,
          match_count: 1,
          lookback_days: 3
        });

        if (match && match.length > 0 && match[0].cluster_id) {
          await supabase.from('articles').update({ cluster_id: match[0].cluster_id }).eq('id', article.id);
        } else {
          const { data: newCluster } = await supabase
            .from('clusters')
            .insert({ label: article.title })
            .select()
            .single();

          if (newCluster) {
            await supabase.from('articles').update({ cluster_id: newCluster.id }).eq('id', article.id);
          }
        }
      }
    }

    const { data: needsScoring } = await supabase
      .from('articles')
      .select('id, title, content, published_at, cluster_id')
      .is('relevance_score', null)
      .limit(10);

    if (needsScoring && needsScoring.length > 0) {
      // Chunk processing (Batch size = 5) to save API calls
      const batchSize = 5;
      for (let i = 0; i < needsScoring.length; i += batchSize) {
        const batch = needsScoring.slice(i, i + batchSize);
        // Prepare simple objects for batch scoring
        const batchForAI = batch.map(a => ({ id: a.id, title: a.title, content: a.content || '' }));

        // Call AI in Batch
        const scoresMap = await scoreBatchArticles(batchForAI);
        await sleep(llmDelayMs * 2); // Increased delay slightly for bigger payload

        // Process results
        for (const article of batch) {
          const baseScore = scoresMap[article.id] || 0;

          const { count: sourcesCount } = await supabase
            .from('articles')
            .select('*', { count: 'exact', head: true })
            .eq('cluster_id', article.cluster_id);

          const finalScore = computeFinalScore(baseScore, {
            contentLength: article.content?.length,
            publishedAt: article.published_at,
            sourcesCount: sourcesCount || 1
          });

          await supabase.from('articles').update({
            relevance_score: baseScore,
            final_score: finalScore
          }).eq('id', article.id);
        }
      }
    }

    const { data: publishedClusters } = await supabase
      .from('articles')
      .select('cluster_id')
      .eq('is_published', true)
      .not('cluster_id', 'is', null);

    const publishedClusterIds = new Set(publishedClusters?.map((item) => item.cluster_id));

    const { data: clustersToProcess } = await supabase
      .from('articles')
      .select('cluster_id')
      .gte('final_score', publishThreshold)
      .is('summary_short', null)
      .order('final_score', { ascending: false })
      .limit(10);

    const uniqueClusterIds = Array.from(new Set(clustersToProcess?.map(a => a.cluster_id)))
      .filter((clusterId) => clusterId && !publishedClusterIds.has(clusterId));

    let rewrittenCount = 0;
    for (const clusterId of uniqueClusterIds) {
      if (!clusterId) continue;

      const { data: sources } = await supabase
        .from('articles')
        .select('title, content, source_name')
        .eq('cluster_id', clusterId)
        .order('final_score', { ascending: false });

      if (sources && sources.length > 0) {
        const rewritten = await rewriteArticle(sources);
        await sleep(llmDelayMs);

        if (rewritten) {
          const { data: topArticle } = await supabase
            .from('articles')
            .select('id, final_score')
            .eq('cluster_id', clusterId)
            .order('final_score', { ascending: false })
            .limit(1)
            .single();

          if (topArticle) {
            await supabase.from('articles').update({
              title: rewritten.title,
              summary_short: JSON.stringify({
                tldr: rewritten.tldr,
                full: rewritten.content,
                analysis: rewritten.impact,
                isFullSynthesis: true,
                sourceCount: sources.length
              }),
              is_published: true,
              published_on: todayDate
            }).eq('id', topArticle.id);

            await supabase.from('clusters').update({
              is_published: true,
              final_score: topArticle.final_score,
              last_processed_at: new Date().toISOString(),
              published_on: todayDate
            }).eq('id', clusterId);

            rewrittenCount++;
          }
        }
      }
    }

    // Limit enforcement removed per user request (Unlimited publication for relevant articles)

    return NextResponse.json({
      success: true,
      processed: {
        embeddings: needsEmbedding?.length || 0,
        clustered: needsClustering?.length || 0,
        scored: needsScoring?.length || 0,
        rewritten: rewrittenCount,
        batches: Math.ceil((needsScoring?.length || 0) / 5)
      }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    // Check for Rate Limit error signature
    if (message.includes('429') || message.toLowerCase().includes('rate limit')) {
      return NextResponse.json(
        { success: false, error: message, retryAfter: 30 }, // Default safe fallback if not parsed
        { status: 429 }
      );
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
