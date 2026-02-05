import { createClient } from '@supabase/supabase-js';
import {
  rewriteArticle,
  generateEmbedding,
  scoreCluster,
  type AIOverrideConfig
} from '../ai';
import {
  startProcessing,
  shouldStopProcessing,
  finishProcessing,
  updateProgress
} from '../processing-state';
import {
  getPublicationConfig,
  type PublicationOverrides
} from '../publication-rules';

export type ProcessStep = 'embedding' | 'clustering' | 'scoring' | 'rewriting' | 'all';

export interface ProcessOptions {
  step?: ProcessStep;
  config?: AIOverrideConfig;
  publicationOverrides?: PublicationOverrides;
  maxExecutionMs?: number;
  useProcessingState?: boolean;
  log?: (message: string) => void;
}

export interface ProcessResult {
  success: boolean;
  step: ProcessStep;
  processed: {
    embeddings: number;
    clustered: number;
    scored: number;
    rewritten: number;
    batches: number;
    stopped: boolean;
  };
  error?: string;
  retryAfter?: number;
}

// Helper: Normalize Source Category to AI Category
function normalizeCategory(sourceCategory: string | null): string {
  if (!sourceCategory) return 'Général';

  const mapping: Record<string, string> = {
    'Tech News': 'Général',
    'Apple': 'Mobile',
    'Smartphones': 'Mobile',
  };

  return mapping[sourceCategory] || sourceCategory;
}

export async function runProcess(options: ProcessOptions = {}): Promise<ProcessResult> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const log = options.log || console.log;
  const step: ProcessStep = options.step || 'all';
  const pubConfig = getPublicationConfig(options.publicationOverrides);

  const results = {
    embeddings: 0,
    clustered: 0,
    scored: 0,
    rewritten: 0,
    batches: 0,
    stopped: false
  };

  const useProcessingState = options.useProcessingState ?? true;
  const maxExecutionMs = options.maxExecutionMs ?? 270000;

  const safeShouldStop = async () => {
    if (!useProcessingState) return false;
    return shouldStopProcessing();
  };

  const safeUpdateProgress = async (current: number, total: number, label?: string) => {
    if (!useProcessingState) return;
    await updateProgress(current, total, label);
  };

  let canStart = true;
  if (useProcessingState) {
    canStart = await startProcessing(step);
    if (!canStart) {
      await finishProcessing();
      return {
        success: true,
        step,
        processed: { ...results, stopped: true }
      };
    }
  }

  // Detect keys from request config OR environment variables (Vital for Cron)
  // User strategy: PAID_ prefix implies "Fast/Paid" mode. Standard keys might be Free/Slow (esp. Google).
  const envPaidGoogle = process.env.PAID_GOOGLE_API_KEY;
  const envPaidOpenAI = process.env.PAID_OPENAI_API_KEY;
  const envPaidAnthropic = process.env.PAID_ANTHROPIC_API_KEY;

  // Construct effective config merging Body Config (priority) > Paid Env Vars
  const effectiveConfig: AIOverrideConfig = {
    ...options.config,
    openaiKey: options.config?.openaiKey || envPaidOpenAI,
    anthropicKey: options.config?.anthropicKey || envPaidAnthropic,
    geminiKey: options.config?.geminiKey || envPaidGoogle,
    preferredProvider: options.config?.preferredProvider || (envPaidOpenAI ? 'openai' : envPaidAnthropic ? 'anthropic' : 'auto')
  };

  // Fast Mode is enabled ONLY if we have a PAID key active in the config
  const hasPaidKey = !!(effectiveConfig.openaiKey || effectiveConfig.anthropicKey || effectiveConfig.geminiKey);

  const publishThreshold = pubConfig.publishThreshold;
  // Speed Boost: 50 items/loop if paid/env present, 10 if free.
  const processingLimit = hasPaidKey ? 50 : 10;
  const llmDelayMs = hasPaidKey ? 100 : 2500;

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const startTime = Date.now();
  const isTimeSafelyRemaining = () => {
    return (Date.now() - startTime) < maxExecutionMs;
  };

  try {
    // ═══════════════════════════════════════════════════════════════════
    // STEP 1: EMBEDDING (WATERFALL LOOP: Finished when no more work OR timeout)
    // ═══════════════════════════════════════════════════════════════════
    while ((step === 'embedding' || step === 'all') && isTimeSafelyRemaining() && !results.stopped) {
      const { data: needsEmbedding } = await supabase
        .from('articles')
        .select('id, title, content')
        .is('embedding', null)
        .order('created_at', { ascending: true })
        .limit(processingLimit);

      if (needsEmbedding && needsEmbedding.length > 0) {
        log(`[EMBED] Starting batch of ${needsEmbedding.length} articles...`);
      }

      if (!needsEmbedding || needsEmbedding.length === 0) {
        // No more work for this step
        break;
      }

      let processedInBatch = 0;
      for (const article of needsEmbedding) {
        if (await safeShouldStop()) { results.stopped = true; break; }
        if (!isTimeSafelyRemaining()) { results.stopped = true; break; }

        try {
          const contentSnippet = article.content ? article.content.slice(0, 1000) : '';
          const textToEmbed = `${article.title}\n\n${contentSnippet}`;

          const embedding = await generateEmbedding(textToEmbed, effectiveConfig.geminiKey);

          if (embedding) {
            const { error: updateError } = await supabase.from('articles').update({ embedding }).eq('id', article.id);
            if (!updateError) {
              results.embeddings++;
              processedInBatch++;
            }
          }
        } catch (error: any) {
          if (error.message?.includes('429') || error.status === 429) throw error;
          log(`[EMBED ERROR] Failed to embed article ${article.id}: ${error}`);
        }
      }

      // Avoid infinite loops if something is stuck
      if (processedInBatch === 0) break;

      await safeUpdateProgress(results.embeddings, -1, `Embedding: ${results.embeddings} traités...`);
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 2: CLUSTERING (WATERFALL LOOP)
    // ═══════════════════════════════════════════════════════════════════
    while ((step === 'clustering' || step === 'all') && isTimeSafelyRemaining() && !results.stopped) {
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
        if (await safeShouldStop()) { results.stopped = true; break; }
        if (!isTimeSafelyRemaining()) { results.stopped = true; break; }

        const { data: matches } = await supabase.rpc('find_similar_articles', {
          query_embedding: article.embedding,
          match_threshold: 0.75,
          match_count: 20,
          anchor_date: article.published_at || new Date().toISOString(),
          window_days: 7,
          exclude_id: article.id
        });

        // Strategy: Prefer joining an existing cluster
        const bestMatchWithCluster = matches?.find((m: any) => m.cluster_id);

        if (bestMatchWithCluster) {
          // Join existing cluster
          await supabase.from('articles').update({ cluster_id: bestMatchWithCluster.cluster_id }).eq('id', article.id);
        } else {
          // Create new cluster
          const { data: newCluster } = await supabase
            .from('clusters')
            .insert({
              label: article.title,
              category: normalizeCategory(article.category)
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
      await safeUpdateProgress(results.clustered, -1, `Clustering: ${results.clustered} traités...`);
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 3: SCORING (WATERFALL LOOP)
    // ═══════════════════════════════════════════════════════════════════
    while ((step === 'scoring' || step === 'all') && isTimeSafelyRemaining() && !results.stopped) {
      // Fetch known unscored clusters
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

      await safeUpdateProgress(results.scored, -1, `Scoring: ${results.scored} traités...`);

      let processedInBatch = 0;
      for (const cluster of clustersToScore) {
        if (await safeShouldStop()) { results.stopped = true; break; }
        if (!isTimeSafelyRemaining()) { results.stopped = true; break; }

        // Supabase typing
        const articles = (Array.isArray(cluster.articles) ? cluster.articles : []) as any[];

        if (articles.length === 0) {
          await supabase.from('clusters').update({ final_score: 0 }).eq('id', cluster.id);
          continue;
        }

        // New Cluster-Centric Scoring
        const evaluation = await scoreCluster(articles, effectiveConfig);

        // Save score
        await supabase.from('clusters').update({
          final_score: evaluation.score,
          representative_article_id: evaluation.representative_id
        }).eq('id', cluster.id);

        results.scored++;
        processedInBatch++;
        await sleep(llmDelayMs); // Respect Rate Limit
      }

      if (processedInBatch === 0) break;
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 4: REWRITING & PUBLISHING (REVERSE LOOKUP OPTIMIZATION)
    // ═══════════════════════════════════════════════════════════════════
    while ((step === 'rewriting' || step === 'all') && isTimeSafelyRemaining() && !results.stopped) {
      const { data: publishedClusters } = await supabase
        .from('clusters')
        .select('id')
        .eq('is_published', true);

      const publishedClusterIds = new Set(publishedClusters?.map((item) => item.id));

      // 1. Reverse Lookup: Find clusters active recently
      const freshnessCutoff = pubConfig.freshnessCutoff;
      log(`[REWRITE] Reverse Lookup: Finding active clusters since ${freshnessCutoff}...`);

      const potentialClusterIds = new Set<string>();
      let freshOffset = 0;
      const freshLimit = 1000;

      while (true) {
        if (await safeShouldStop()) { results.stopped = true; break; }

        const { data: freshBatch } = await supabase
          .from('articles')
          .select('cluster_id')
          .gte('published_at', freshnessCutoff)
          .not('cluster_id', 'is', null)
          .range(freshOffset, freshOffset + freshLimit - 1);

        if (!freshBatch || freshBatch.length === 0) break;

        freshBatch.forEach(a => {
          if (a.cluster_id) potentialClusterIds.add(a.cluster_id);
        });

        if (freshBatch.length < freshLimit) break;
        freshOffset += freshLimit;
      }

      const activeClusterIds = Array.from(potentialClusterIds).filter(id => !publishedClusterIds.has(id));
      log(`[REWRITE] Found ${activeClusterIds.length} active unpublished clusters.`);

      if (activeClusterIds.length === 0 || results.stopped) {
        if (!results.stopped) log('[REWRITE] No active clusters found.');
        break;
      }

      // 2. Pre-filter active clusters by Score (Batch fetch)
      const validCandidates: { id: string, final_score: number }[] = [];
      const chunkSize = 100;

      for (let i = 0; i < activeClusterIds.length; i += chunkSize) {
        const batchIds = activeClusterIds.slice(i, i + chunkSize);
        const { data: batchClusters } = await supabase
          .from('clusters')
          .select('id, final_score')
          .in('id', batchIds)
          .gte('final_score', publishThreshold)
          .eq('is_published', false);

        if (batchClusters) validCandidates.push(...batchClusters);
      }

      // Sort candidates by score descending
      validCandidates.sort((a, b) => b.final_score - a.final_score);
      log(`[REWRITE] ${validCandidates.length} clusters passed score threshold (${publishThreshold}).`);

      if (validCandidates.length === 0) {
        break;
      }

      // 3. Full Verification (Fetch all articles for history check)
      const filteredClusterIds: string[] = [];
      const candidateIds = validCandidates.map(c => c.id);

      let allArticles: any[] = [];
      for (let i = 0; i < candidateIds.length; i += chunkSize) {
        const batchIds = candidateIds.slice(i, i + chunkSize);
        const { data: batchArticles } = await supabase
          .from('articles')
          .select('cluster_id, source_name, published_at')
          .in('cluster_id', batchIds);

        if (batchArticles) allArticles.push(...batchArticles);
      }

      const articlesByCluster = allArticles.reduce((acc, art) => {
        if (!acc[art.cluster_id]) acc[art.cluster_id] = [];
        acc[art.cluster_id].push(art);
        return acc;
      }, {} as Record<string, any[]>);

      for (const cluster of validCandidates) {
        if (filteredClusterIds.length >= processingLimit) break;

        const clusterArticles = articlesByCluster[cluster.id] || [];
        if (clusterArticles.length === 0) continue;

        // Maturity Check
        if (!pubConfig.ignoreMaturity && pubConfig.maturityHours > 0) {
          clusterArticles.sort((a: any, b: any) => new Date(a.published_at).getTime() - new Date(b.published_at).getTime());
          const oldestArticleDate = new Date(clusterArticles[0].published_at).getTime();
          const maturityMillis = pubConfig.maturityHours * 60 * 60 * 1000;
          if ((Date.now() - oldestArticleDate) < maturityMillis) continue;
        }

        // Min Sources Check
        if (pubConfig.minSources > 1) {
          const uniqueSources = new Set(clusterArticles.map((a: any) => a.source_name)).size;
          if (uniqueSources < pubConfig.minSources) continue;
        }

        filteredClusterIds.push(cluster.id);
      }

      if (filteredClusterIds.length === 0) {
        log('[REWRITE] No clusters passed final filters (Sources/Maturity).');
        break;
      }

      log(`[REWRITE] Found ${filteredClusterIds.length} eligible clusters ready for rewriting.`);
      await safeUpdateProgress(results.rewritten, -1, `Démarrage rédaction batch...`);

      let processedInBatch = 0;
      for (const clusterId of filteredClusterIds) {
        if (await safeShouldStop()) { results.stopped = true; break; }
        if (!isTimeSafelyRemaining()) { results.stopped = true; break; }

        await safeUpdateProgress(results.rewritten, -1, `Rédaction: ${results.rewritten} publiés...`);

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
          } catch (e) {
            log(`[REWRITE ERROR] Exception during rewriteArticle: ${e}`);
          }

          // SAFETY CHECK
          if (rewritten && rewritten.title && rewritten.content && rewritten.title.length > 5 && rewritten.content.length > 50) {
            // Fetch Image for top article
            const { data: topArticle } = await supabase
              .from('articles')
              .select('id, final_score, title, image_url')
              .eq('cluster_id', clusterId)
              .order('final_score', { ascending: false })
              .limit(1)
              .single();

            if (topArticle) {
              const { error: insertError } = await supabase.from('summaries').upsert({
                cluster_id: clusterId,
                title: rewritten.title,
                content_tldr: rewritten.tldr,
                content_analysis: rewritten.impact,
                content_full: rewritten.content,
                image_url: topArticle.image_url,
                source_count: sources.length,
                model_name: effectiveConfig?.preferredProvider || 'auto'
              }, { onConflict: 'cluster_id' });

              if (!insertError) {
                // Only mark as published if Summary insert success
                await supabase.from('clusters').update({
                  is_published: true,
                  last_processed_at: new Date().toISOString(),
                  published_on: new Date().toISOString(),
                  label: rewritten.title,
                  image_url: topArticle.image_url,
                  category: rewritten.category // Save the AI category
                }).eq('id', clusterId);

                results.rewritten++;
                processedInBatch++;
              }
            }
          } else {
            log(`[REWRITE INVALID] Content invalid or empty for cluster ${clusterId}. Skipping publication.`);
          }

          await sleep(llmDelayMs);
        }
      }

      if (processedInBatch === 0) break;
    }

    return {
      success: true,
      step,
      processed: results
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('429') || message.toLowerCase().includes('rate limit')) {
      return { success: false, error: message, retryAfter: 30, step, processed: results };
    }
    return { success: false, error: message, step, processed: results };
  } finally {
    if (useProcessingState) {
      await finishProcessing();
    }
  }
}
