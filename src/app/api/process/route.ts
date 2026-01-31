import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  scoreBatchArticles,
  rewriteArticle,
  generateEmbedding,
  computeFinalScore,
  scoreCluster
} from '@/lib/ai';
import {
  startProcessing,
  shouldStopProcessing,
  finishProcessing,
  getProcessingState,
  updateProgress
} from '@/lib/processing-state';
import {
  PUBLICATION_RULES,
  getPublicationConfig,
  getFreshnessCutoff,
  type PublicationOverrides
} from '@/lib/publication-rules';

type Step = 'embedding' | 'clustering' | 'scoring' | 'rewriting' | 'all';

// Define AI Config interface matching lib/ai.ts
interface AIOverrideConfig {
  openaiKey?: string;
  anthropicKey?: string;
  geminiKey?: string;
  preferredProvider?: 'auto' | 'openai' | 'anthropic' | 'gemini';
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

export async function POST(req: NextRequest) {
  // ... (rest of the file remains unchanged until the usage point)

  // ... inside the clustering loop ...

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { searchParams } = new URL(req.url);
  const stepParam = searchParams.get('step');

  let body: { step?: string, config?: AIOverrideConfig } & PublicationOverrides = {};
  try {
    body = await req.json();
  } catch (e) {
    // Body is optional
  }

  const step = ((body.step || stepParam) as Step) || 'all';
  const aiConfig = body.config;
  const pubConfig = getPublicationConfig(body);  // Centralized config with overrides

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

  // Detect keys from request config OR environment variables (Vital for Cron)
  // User strategy: PAID_ prefix implies "Fast/Paid" mode. Standard keys might be Free/Slow (esp. Google).

  const envPaidGoogle = process.env.PAID_GOOGLE_API_KEY;
  const envPaidOpenAI = process.env.PAID_OPENAI_API_KEY;
  const envPaidAnthropic = process.env.PAID_ANTHROPIC_API_KEY;

  // Construct effective config merging Body Config (priority) > Paid Env Vars
  const effectiveConfig: AIOverrideConfig = {
    ...body.config,
    openaiKey: body.config?.openaiKey || envPaidOpenAI,
    anthropicKey: body.config?.anthropicKey || envPaidAnthropic,
    geminiKey: body.config?.geminiKey || envPaidGoogle,
    preferredProvider: body.config?.preferredProvider || (envPaidOpenAI ? 'openai' : envPaidAnthropic ? 'anthropic' : 'auto')
  };

  // Fast Mode is enabled ONLY if we have a PAID key active in the config
  const hasPaidKey = !!(effectiveConfig.openaiKey || effectiveConfig.anthropicKey || effectiveConfig.geminiKey);

  const publishThreshold = pubConfig.publishThreshold;
  // Speed Boost: 50 items/loop if paid/env present, 10 if free.
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

  // Security: Max Duration (Vercel Free Tier = 10s default for API routes, but Cron can be longer)
  // User confirmed 5 minutes available. Setting to 4m30s (270s) to be safe.
  const MAX_EXECUTION_TIME_MS = 270000; // 4m30s
  const startTime = Date.now();

  const isTimeSafelyRemaining = () => {
    return (Date.now() - startTime) < MAX_EXECUTION_TIME_MS;
  };

  try {
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

        if (!needsEmbedding || needsEmbedding.length === 0) {
          // No more work for this step
          break;
        }

        let processedInBatch = 0;
        for (const article of needsEmbedding) {
          if (await shouldStopProcessing()) { results.stopped = true; break; }
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
            console.error(`[EMBED ERROR] Failed to embed article ${article.id}:`, error);
          }
        }

        // Avoid infinite loops if something is stuck (though we skip errored items in next query ideally, but here we query is('embedding', null))
        // If we processed 0 items in a non-empty batch, it means all failed. We should probably break to avoid hammering.
        if (processedInBatch === 0) break;

        await updateProgress(results.embeddings, -1, `Embedding: ${results.embeddings} traités...`);
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

        if (!needsClustering || needsClustering.length === 0) {
          break;
        }

        let processedInBatch = 0;
        for (const article of needsClustering) {
          if (await shouldStopProcessing()) { results.stopped = true; break; }
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
        await updateProgress(results.clustered, -1, `Clustering: ${results.clustered} traités...`);
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

        if (scoreQueryError) {
          console.error("Scoring Query Error:", scoreQueryError);
          break;
        }

        if (!clustersToScore || clustersToScore.length === 0) {
          break;
        }

        await updateProgress(results.scored, -1, `Scoring: ${results.scored} traités...`);

        let processedInBatch = 0;
        for (const cluster of clustersToScore) {
          if (await shouldStopProcessing()) { results.stopped = true; break; }
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
      // STEP 4: REWRITING & PUBLISHING (WATERFALL LOOP - Careful with limits here)
      // ═══════════════════════════════════════════════════════════════════
      // Note: Rewriting can be expensive and consume quota. We might want to limit this loop strictly 
      // or at least be very conscious of time.
      while ((step === 'rewriting' || step === 'all') && isTimeSafelyRemaining() && !results.stopped) {

        const { data: publishedClusters } = await supabase
          .from('clusters')
          .select('id')
          .eq('is_published', true);

        const publishedClusterIds = new Set(publishedClusters?.map((item) => item.id));

        // Build rewriting query - get more candidates to find ones that pass filters
        let query = supabase
          .from('clusters')
          .select('id, final_score')
          .gte('final_score', publishThreshold)
          .eq('is_published', false) // Only unpublished
          .order('final_score', { ascending: false })
          .limit(500); // Increased to find clusters that actually pass filters

        const { data: clustersToProcess } = await query;
        const filteredClusterIds: string[] = [];
        const freshnessCutoff = pubConfig.freshnessCutoff;

        if (!clustersToProcess || clustersToProcess.length === 0) {
          break; // No more candidates
        }

        // Batch fetch optimization...
        const candidateIds = clustersToProcess
          .filter(c => !publishedClusterIds.has(c.id))
          .map(c => c.id);

        if (candidateIds.length > 0) {
          // Paginate article fetching to bypass 1000 row limit
          let allArticles: any[] = [];
          const chunkSize = 100; // Process in chunks to avoid huge IN() queries

          for (let i = 0; i < candidateIds.length; i += chunkSize) {
            const chunk = candidateIds.slice(i, i + chunkSize);
            const { data: chunkArticles } = await supabase
              .from('articles')
              .select('cluster_id, source_name, published_at')
              .in('cluster_id', chunk);

            if (chunkArticles) {
              allArticles = allArticles.concat(chunkArticles);
            }
          }

          const articlesByCluster = allArticles.reduce((acc, art) => {
            if (!acc[art.cluster_id]) acc[art.cluster_id] = [];
            acc[art.cluster_id].push(art);
            return acc;
          }, {} as Record<string, any[]>);

          for (const cluster of clustersToProcess) {
            if (filteredClusterIds.length >= processingLimit) break;
            if (!candidateIds.includes(cluster.id)) continue;

            const clusterArticles = articlesByCluster[cluster.id] || [];
            if (clusterArticles.length === 0) continue;

            // Maturity Check
            if (!pubConfig.ignoreMaturity && pubConfig.maturityHours > 0) {
              const oldestArticleDate = new Date(clusterArticles[0].published_at).getTime();
              const maturityMillis = pubConfig.maturityHours * 60 * 60 * 1000;
              if ((Date.now() - oldestArticleDate) < maturityMillis) continue;
            }

            // Freshness Check
            if (pubConfig.freshOnly) {
              const hasFreshArticle = clusterArticles.some((a: any) => a.published_at >= freshnessCutoff);
              if (!hasFreshArticle) continue;
            }

            // Min Sources Check
            if (pubConfig.minSources > 1) {
              const uniqueSources = new Set(clusterArticles.map((a: any) => a.source_name)).size;
              if (uniqueSources < pubConfig.minSources) continue;
            }

            filteredClusterIds.push(cluster.id);
          }
        }

        if (filteredClusterIds.length === 0) {
          break; // No candidates passed filters
        }

        await updateProgress(results.rewritten, -1, `Démarrage rédaction batch...`);

        let processedInBatch = 0;
        for (const clusterId of filteredClusterIds) {
          if (await shouldStopProcessing()) { results.stopped = true; break; }
          if (!isTimeSafelyRemaining()) { results.stopped = true; break; }

          await updateProgress(results.rewritten, -1, `Rédaction: ${results.rewritten} publiés...`);


          const { data: sources } = await supabase
            .from('articles')
            .select('title, content, source_name')
            .eq('cluster_id', clusterId)
            .order('final_score', { ascending: false });

          if (sources && sources.length > 0) {
            let rewritten = null;
            try {
              rewritten = await rewriteArticle(sources, effectiveConfig);
            } catch (e) {
              console.error(`[REWRITE ERROR] Exception during rewriteArticle:`, e);
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
              console.warn(`[REWRITE INVALID] Content invalid or empty for cluster ${clusterId}. Skipping publication.`);
            }

            await sleep(llmDelayMs);
          }
        }

        if (processedInBatch === 0) break;
      }

      return NextResponse.json({
        success: true,
        step,
        processed: results
      });

    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('429') || message.toLowerCase().includes('rate limit')) {
        return NextResponse.json(
          { success: false, error: message, retryAfter: 30 },
          { status: 429 }
        );
      }
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  } finally {
    await finishProcessing();
  }
}
