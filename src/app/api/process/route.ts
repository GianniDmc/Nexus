import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  scoreBatchArticles,
  rewriteArticle,
  generateEmbedding,
  computeFinalScore
} from '@/lib/ai';
import {
  startProcessing,
  shouldStopProcessing,
  finishProcessing,
  getProcessingState,
  updateProgress
} from '@/lib/processing-state';

type Step = 'embedding' | 'clustering' | 'scoring' | 'rewriting' | 'all';

// Define AI Config interface matching lib/ai.ts
interface AIOverrideConfig {
  openaiKey?: string;
  anthropicKey?: string;
  geminiKey?: string;
  preferredProvider?: 'auto' | 'openai' | 'anthropic' | 'gemini';
}

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { searchParams } = new URL(req.url);
  const stepParam = searchParams.get('step');

  let body: { step?: string, config?: AIOverrideConfig } = {};
  try {
    body = await req.json();
  } catch (e) {
    // Body is optional
  }

  const step = ((body.step || stepParam) as Step) || 'all';
  const aiConfig = body.config;

  // Register this processing session (for loop mode detection via UI)
  // Returns false if a stop was requested
  const canStart = await startProcessing(step);

  if (!canStart) {
    // Stop was requested, exit early
    await finishProcessing();
    return NextResponse.json({
      success: true,
      step,
      processed: { embeddings: 0, clustered: 0, scored: 0, rewritten: 0, batches: 0, stopped: true }
    });
  }

  const hasPaidKey = !!(aiConfig?.openaiKey || aiConfig?.anthropicKey || aiConfig?.geminiKey);
  const publishThreshold = 4.0;
  // Speed Boost: 50 items/loop if paid, 10 if free. Batch 25 vs 5. Delay 100ms vs 2s.
  const processingLimit = hasPaidKey ? 50 : 10;
  const llmDelayMs = hasPaidKey ? 100 : 2500;
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const todayDate = new Date().toISOString().slice(0, 10);

  const results = {
    embeddings: 0,
    clustered: 0,
    scored: 0,
    rewritten: 0,
    batches: 0,
    stopped: false
  };

  try {
    // ═══════════════════════════════════════════════════════════════════
    // STEP 1: EMBEDDING
    // ═══════════════════════════════════════════════════════════════════
    if (step === 'embedding' || step === 'all') {
      const { data: needsEmbedding } = await supabase
        .from('articles')
        .select('id, title, content')
        .is('embedding', null)
        .order('created_at', { ascending: true })
        .limit(processingLimit);

      if (needsEmbedding && needsEmbedding.length > 0) {
        for (const article of needsEmbedding) {
          if (await shouldStopProcessing()) { results.stopped = true; break; }
          try {
            const contentSnippet = article.content ? article.content.slice(0, 1000) : '';
            const textToEmbed = `${article.title}\n\n${contentSnippet}`;

            const embedding = await generateEmbedding(textToEmbed);

            if (embedding) {
              const { error: updateError } = await supabase.from('articles').update({ embedding }).eq('id', article.id);
              if (!updateError) results.embeddings++;
            }
          } catch (error: any) {
            if (error.message?.includes('429') || error.status === 429) throw error;
            // Skip this article on error (no updated_at column to cycle it)
          }
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 2: CLUSTERING
    // ═══════════════════════════════════════════════════════════════════
    if (step === 'clustering' || step === 'all') {
      const { data: needsClustering } = await supabase
        .from('articles')
        .select('id, title, embedding')
        .not('embedding', 'is', null)
        .is('cluster_id', null)
        .limit(10);

      if (needsClustering && needsClustering.length > 0) {
        for (const article of needsClustering) {
          if (await shouldStopProcessing()) { results.stopped = true; break; }
          const { data: match } = await supabase.rpc('find_similar_articles', {
            query_embedding: article.embedding,
            match_threshold: 0.75, // Balanced threshold (was 0.60, then 0.80)
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
          results.clustered++;
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 3: SCORING
    // ═══════════════════════════════════════════════════════════════════
    if (step === 'scoring' || step === 'all') {
      const { data: needsScoring } = await supabase
        .from('articles')
        .select('id, title, content, published_at, cluster_id')
        .is('relevance_score', null)
        .limit(processingLimit);

      if (needsScoring && needsScoring.length > 0) {
        const { count: remainingCount } = await supabase
          .from('articles')
          .select('*', { count: 'exact', head: true })
          .is('relevance_score', null);

        const batchSize = hasPaidKey ? 25 : 5;
        await updateProgress(0, needsScoring.length, `Démarrage scoring (Reste: ${remainingCount})...`);

        for (let i = 0; i < needsScoring.length; i += batchSize) {
          if (await shouldStopProcessing()) { results.stopped = true; break; }
          const batch = needsScoring.slice(i, i + batchSize);
          const batchForAI = batch.map(a => ({ id: a.id, title: a.title, content: a.content || '' }));
          const scoresMap = await scoreBatchArticles(batchForAI, aiConfig);

          // Check stop again after long LLM call
          if (await shouldStopProcessing()) { results.stopped = true; break; }

          await sleep(llmDelayMs);

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

            results.scored++;
          }
          results.batches++;
          await updateProgress(Math.min(i + batchSize, needsScoring.length), needsScoring.length, `Notation lot ${results.batches} (Reste global: ${remainingCount})...`);
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 4: REWRITING & PUBLISHING
    // ═══════════════════════════════════════════════════════════════════
    if (step === 'rewriting' || step === 'all') {
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
        .is('summary_short', null)
        .order('final_score', { ascending: false })
        .limit(processingLimit);

      const candidates = Array.from(new Set(clustersToProcess?.map(a => a.cluster_id)));
      const uniqueClusterIds: string[] = [];

      for (const cid of candidates) {
        if (!cid) continue;
        if (publishedClusterIds.has(cid)) {
          await supabase.from('articles')
            .update({ summary_short: '{"skipped": true, "reason": "zombie_cluster"}' })
            .eq('cluster_id', cid)
            .is('summary_short', null);
        } else {
          uniqueClusterIds.push(cid);
        }
      }

      await updateProgress(0, uniqueClusterIds.length, 'Démarrage de la rédaction...');

      for (const clusterId of uniqueClusterIds) {
        if (!clusterId) continue;
        await updateProgress(results.rewritten + 1, uniqueClusterIds.length, `Rédaction (${results.rewritten + 1}/${uniqueClusterIds.length})...`);

        if (await shouldStopProcessing()) { results.stopped = true; break; }

        const { data: sources } = await supabase
          .from('articles')
          .select('title, content, source_name')
          .eq('cluster_id', clusterId)
          .order('final_score', { ascending: false });

        if (sources && sources.length > 0) {
          const rewritten = await rewriteArticle(sources, aiConfig);

          if (await shouldStopProcessing()) { results.stopped = true; break; }

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
                category: rewritten.category,
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

              results.rewritten++;
            }
          }
        }
      }
    }

    finishProcessing();
    return NextResponse.json({
      success: true,
      step,
      processed: results
    });

  } catch (error: unknown) {
    finishProcessing();
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('429') || message.toLowerCase().includes('rate limit')) {
      return NextResponse.json(
        { success: false, error: message, retryAfter: 30 },
        { status: 429 }
      );
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
