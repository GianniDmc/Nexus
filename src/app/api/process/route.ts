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

export async function POST(req: NextRequest) {
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
    preferredProvider: body.config?.preferredProvider || ( ? 'openai' : envPaidAnthropic ? 'anthropic' : 'auto')
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

            const embedding = await generateEmbedding(textToEmbed, effectiveConfig.geminiKey);

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
        .select('id, title, embedding, published_at')
        .not('embedding', 'is', null)
        .is('cluster_id', null)
        .limit(10);

      if (needsClustering && needsClustering.length > 0) {
        for (const article of needsClustering) {
          if (await shouldStopProcessing()) { results.stopped = true; break; }
          const { data: matches } = await supabase.rpc('find_similar_articles', {
            query_embedding: article.embedding,
            match_threshold: 0.75,
            match_count: 20, // Increased from 5 to 20 to handle high volume/redundancy
            anchor_date: article.published_at || new Date().toISOString(),
            window_days: 7,
            exclude_id: article.id
          });

          // Strategy: Prefer joining an existing cluster (even if it's the 2nd or 3rd best match)
          // to avoid fragmentation.
          const bestMatchWithCluster = matches?.find((m: any) => m.cluster_id);

          if (bestMatchWithCluster) {
            await supabase.from('articles').update({ cluster_id: bestMatchWithCluster.cluster_id }).eq('id', article.id);
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
    // STEP 3: SCORING (Cluster Centric)
    // ═══════════════════════════════════════════════════════════════════
    if (step === 'scoring' || step === 'all') {
      // Fetch clusters needing scoring (final_score is null)
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
      }

      if (clustersToScore && clustersToScore.length > 0) {
        await updateProgress(0, clustersToScore.length, `Scoring de ${clustersToScore.length} clusters...`);

        for (const cluster of clustersToScore) {
          if (await shouldStopProcessing()) { results.stopped = true; break; }

          // Supabase typing for joined relations can be tricky, casting safely
          const articles = (Array.isArray(cluster.articles) ? cluster.articles : []) as any[];

          if (articles.length === 0) {
            // Should not happen, but safeguard
            await supabase.from('clusters').update({ final_score: 0 }).eq('id', cluster.id);
            continue;
          }

          // New Cluster-Centric Scoring
          const evaluation = await scoreCluster(articles, effectiveConfig);

          await sleep(llmDelayMs);

          // Save score and representative article to Cluster
          await supabase.from('clusters').update({
            final_score: evaluation.score,
            representative_article_id: evaluation.representative_id
          }).eq('id', cluster.id);

          results.scored++;
          await updateProgress(results.scored, clustersToScore.length, `Scoring (${results.scored}/${clustersToScore.length})`);
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 4: REWRITING & PUBLISHING
    // ═══════════════════════════════════════════════════════════════════
    if (step === 'rewriting' || step === 'all') {
      // Log start
      // console.log(`[REWRITE] Starting rewriting step...`);

      const { data: publishedClusters } = await supabase
        .from('clusters')
        .select('id')
        .eq('is_published', true);

      const publishedClusterIds = new Set(publishedClusters?.map((item) => item.id));


      // Build rewriting query - Select CLUSTERS based on THEIR score
      let query = supabase
        .from('clusters')
        .select('id, final_score')
        .gte('final_score', publishThreshold)
        .eq('is_published', false) // Only unpublished clusters
        .order('final_score', { ascending: false })
        .limit(processingLimit * 5); // Fetch more to allow for filtering

      const { data: clustersToProcess } = await query;

      const filteredClusterIds: string[] = [];
      const freshnessCutoff = pubConfig.freshnessCutoff;

      if (clustersToProcess) {
        for (const cluster of clustersToProcess) {
          if (publishedClusterIds.has(cluster.id)) continue;



          // Check freshness and maturity
          // Hydrate with articles to check Freshness, Source Count, and Age
          const { data: clusterArticles } = await supabase
            .from('articles')
            .select('source_name, published_at')
            .eq('cluster_id', cluster.id)
            .order('published_at', { ascending: true }); // Oldest first for age check

          if (!clusterArticles || clusterArticles.length === 0) {
            continue;
          }

          // Maturity Check (Anti-Premature Publishing)
          // Rule: Skip if cluster is too young (unless ignored, e.g. manual admin force)
          if (!pubConfig.ignoreMaturity && pubConfig.maturityHours > 0) {
            const oldestArticleDate = new Date(clusterArticles[0].published_at).getTime();
            const maturityMillis = pubConfig.maturityHours * 60 * 60 * 1000;
            const clusterAge = Date.now() - oldestArticleDate;

            if (clusterAge < maturityMillis) {
              // Too young - skip for now, let it mature
              continue;
            }
          }

          // Check freshness: cluster must have at least one fresh article
          // (Unless freshOnly is false)
          if (pubConfig.freshOnly) {
            const hasFreshArticle = clusterArticles.some(a => a.published_at >= freshnessCutoff);

            if (!hasFreshArticle) {
              continue;
            }
          }

          // Check min sources
          if (pubConfig.minSources > 1) {
            const uniqueSources = new Set(clusterArticles.map(a => a.source_name)).size;

            if (uniqueSources < pubConfig.minSources) {
              continue;
            }
          }

          filteredClusterIds.push(cluster.id);
          if (filteredClusterIds.length >= processingLimit) break;
        }
      }



      await updateProgress(0, filteredClusterIds.length, `Démarrage rédaction (${filteredClusterIds.length} clusters qualifiés)...`);

      for (const clusterId of filteredClusterIds) {
        await updateProgress(results.rewritten + 1, filteredClusterIds.length, `Rédaction (${results.rewritten + 1}/${filteredClusterIds.length})...`);

        if (await shouldStopProcessing()) { results.stopped = true; break; }

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

          if (await shouldStopProcessing()) { results.stopped = true; break; }

          await sleep(llmDelayMs);

          if (rewritten) {
            const { data: topArticle } = await supabase
              .from('articles')
              .select('id, final_score, title, image_url')
              .eq('cluster_id', clusterId)
              .order('final_score', { ascending: false })
              .limit(1)
              .single();

            if (topArticle) {
              // 1. Save synthesized content to 'summaries' table
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

              if (insertError) {
                console.error(`[DB ERROR] Failed to insert summary for cluster ${clusterId}:`, insertError);
              } else {
                // 2. Update cluster metadata (status, label, image)
                await supabase.from('clusters').update({
                  is_published: true,
                  last_processed_at: new Date().toISOString(),
                  published_on: todayDate,
                  label: rewritten.title,
                  image_url: topArticle.image_url
                }).eq('id', clusterId);

                results.rewritten++;
              }
            } else {
              console.warn(`[DB WARNING] Could not find top article for cluster ${clusterId}`);
            }
          } else {
            console.warn(`[REWRITE FAILED] internal rewriteArticle returned null for cluster ${clusterId}`);
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
