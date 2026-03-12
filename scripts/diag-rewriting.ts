/**
 * Diagnostic v2 : reproduit fidèlement les requêtes du rewriting step ET du stats API
 * avec pagination correcte pour identifier la desync.
 *
 * Usage : npx tsx scripts/diag-rewriting.ts
 */
import { existsSync } from 'fs';
import { config } from 'dotenv';

if (existsSync('.env.local')) {
  config({ path: '.env.local' });
}

import { createClient } from '@supabase/supabase-js';
import { getPublicationConfig, PUBLICATION_RULES } from '../src/lib/publication-rules';
import { classifyClusterEditorialState } from '../src/lib/editorial-state';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

type Cluster = { id: string; created_at: string; final_score: number | null; is_published: boolean; summary: { id: string }[] | null };
type Article = { cluster_id: string | null; source_name: string | null; published_at: string | null };

async function paginatedQuery<T>(
  queryFn: (offset: number, limit: number) => Promise<{ data: T[] | null; error: any }>,
  pageSize = 1000
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await queryFn(offset, pageSize);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

async function main() {
  const pubConfig = getPublicationConfig();
  const threshold = pubConfig.publishThreshold;

  console.log('=== CONFIG ===');
  console.log(`  threshold=${threshold} freshOnly=${pubConfig.freshOnly} cutoff=${pubConfig.freshnessCutoff}`);
  console.log(`  minSources=${pubConfig.minSources} maturityHours=${pubConfig.maturityHours}`);
  console.log('');

  // ═══════════════════════════════════════════════════
  // A) APPROCHE STATS API (direct, comme le dashboard)
  // ═══════════════════════════════════════════════════
  console.log('═══ A) APPROCHE STATS API (directe) ═══');

  const allCandidates = await paginatedQuery<Cluster>((offset, limit) =>
    supabase
      .from('clusters')
      .select('id, created_at, final_score, is_published, summary:summaries!summaries_cluster_id_fkey(id)')
      .gte('final_score', threshold)
      .eq('is_published', false)
      .is('summary', null)
      .range(offset, offset + limit - 1) as any
  );
  console.log(`  Clusters candidats (score>=${threshold}, !published, !summary): ${allCandidates.length}`);

  // Fetch articles for all candidates
  const articlesByCluster: Record<string, Article[]> = {};
  const candidateIds = allCandidates.map(c => c.id);

  for (let i = 0; i < candidateIds.length; i += 200) {
    const batch = candidateIds.slice(i, i + 200);
    const articles = await paginatedQuery<Article>((offset, limit) =>
      supabase
        .from('articles')
        .select('cluster_id, source_name, published_at')
        .in('cluster_id', batch)
        .range(offset, offset + limit - 1) as any
    );
    for (const a of articles) {
      if (!a.cluster_id) continue;
      if (!articlesByCluster[a.cluster_id]) articlesByCluster[a.cluster_id] = [];
      articlesByCluster[a.cluster_id].push(a);
    }
  }

  // Classify
  const classifyConfig = {
    minScore: threshold,
    minSources: pubConfig.minSources,
    freshOnly: pubConfig.freshOnly,
    freshnessCutoff: pubConfig.freshnessCutoff,
    maturityHours: pubConfig.maturityHours,
    ignoreMaturity: pubConfig.ignoreMaturity,
  };

  const stateCounts: Record<string, { clusters: number; articles: number }> = {};
  const eligibleIds: string[] = [];

  for (const cluster of allCandidates) {
    const articles = articlesByCluster[cluster.id] || [];
    const cl = classifyClusterEditorialState(
      {
        created_at: cluster.created_at,
        final_score: cluster.final_score,
        is_published: cluster.is_published,
        has_summary: Array.isArray(cluster.summary) ? cluster.summary.length > 0 : false,
        articles: articles.map(a => ({ source_name: a.source_name, published_at: a.published_at })),
      },
      classifyConfig
    );
    if (!stateCounts[cl.state]) stateCounts[cl.state] = { clusters: 0, articles: 0 };
    stateCounts[cl.state].clusters++;
    stateCounts[cl.state].articles += cl.metrics.article_count;
    if (cl.state === 'eligible_rewriting') eligibleIds.push(cluster.id);
  }

  console.log('  Classification:');
  for (const [state, b] of Object.entries(stateCounts).sort((a, b) => b[1].clusters - a[1].clusters)) {
    console.log(`    ${state}: ${b.clusters} clusters (${b.articles} articles)`);
  }
  console.log(`  ▶ eligible_rewriting: ${eligibleIds.length}`);
  console.log('');

  // ═══════════════════════════════════════════════════
  // B) APPROCHE REWRITING STEP (reverse lookup)
  // ═══════════════════════════════════════════════════
  console.log('═══ B) APPROCHE REWRITING STEP (reverse lookup) ═══');

  // Step 1: fresh articles → cluster_ids
  const freshArticles = await paginatedQuery<{ cluster_id: string }>((offset, limit) =>
    supabase
      .from('articles')
      .select('cluster_id')
      .gte('published_at', pubConfig.freshnessCutoff)
      .not('cluster_id', 'is', null)
      .range(offset, offset + limit - 1) as any
  );
  const freshClusterIds = [...new Set(freshArticles.map(a => a.cluster_id))];
  console.log(`  Articles frais: ${freshArticles.length} → ${freshClusterIds.length} clusters uniques`);

  // Step 2: query clusters with those IDs
  let reverseCandidates: Cluster[] = [];
  for (let i = 0; i < freshClusterIds.length; i += 200) {
    const batch = freshClusterIds.slice(i, i + 200);
    const { data, error } = await supabase
      .from('clusters')
      .select('id, created_at, final_score, is_published, summary:summaries!summaries_cluster_id_fkey(id)')
      .in('id', batch)
      .gte('final_score', threshold)
      .eq('is_published', false)
      .is('summary', null);

    if (error) throw error;
    if (data) reverseCandidates.push(...(data as Cluster[]));
  }
  console.log(`  Clusters candidats (reverse lookup): ${reverseCandidates.length}`);

  // Step 3: classify reverse lookup candidates
  const reverseArticlesByCluster: Record<string, Article[]> = {};
  const reverseCandidateIds = reverseCandidates.map(c => c.id);

  for (let i = 0; i < reverseCandidateIds.length; i += 200) {
    const batch = reverseCandidateIds.slice(i, i + 200);
    const articles = await paginatedQuery<Article>((offset, limit) =>
      supabase
        .from('articles')
        .select('cluster_id, source_name, published_at')
        .in('cluster_id', batch)
        .range(offset, offset + limit - 1) as any
    );
    for (const a of articles) {
      if (!a.cluster_id) continue;
      if (!reverseArticlesByCluster[a.cluster_id]) reverseArticlesByCluster[a.cluster_id] = [];
      reverseArticlesByCluster[a.cluster_id].push(a);
    }
  }

  let reverseEligible = 0;
  for (const cluster of reverseCandidates) {
    const articles = reverseArticlesByCluster[cluster.id] || [];
    const cl = classifyClusterEditorialState(
      {
        created_at: cluster.created_at,
        final_score: cluster.final_score,
        is_published: cluster.is_published,
        has_summary: false,
        articles: articles.map(a => ({ source_name: a.source_name, published_at: a.published_at })),
      },
      classifyConfig
    );
    if (cl.state === 'eligible_rewriting') reverseEligible++;
  }
  console.log(`  Éligibles (reverse lookup + classification): ${reverseEligible}`);
  console.log('');

  // ═══════════════════════════════════════════════════
  // C) ANALYSE DE LA DESYNC
  // ═══════════════════════════════════════════════════
  console.log('═══ C) ANALYSE DESYNC ═══');
  if (eligibleIds.length > 0 && reverseEligible === 0) {
    // Check: are eligible clusters in the fresh cluster IDs?
    const inFresh = eligibleIds.filter(id => freshClusterIds.includes(id));
    const notInFresh = eligibleIds.filter(id => !freshClusterIds.includes(id));
    console.log(`  ${eligibleIds.length} éligibles (stats API) vs ${reverseEligible} (reverse lookup)`);
    console.log(`  ${inFresh.length} éligibles DANS les articles frais`);
    console.log(`  ${notInFresh.length} éligibles PAS dans les articles frais`);

    if (notInFresh.length > 0) {
      console.log('');
      console.log('  ⚠️ Clusters éligibles SANS articles frais (exemples):');
      for (const id of notInFresh.slice(0, 5)) {
        const articles = articlesByCluster[id] || [];
        const uniqueSources = new Set(articles.map(a => a.source_name?.trim()).filter(Boolean));
        const dates = articles.map(a => a.published_at).filter(Boolean).sort();
        console.log(`    ${id.slice(0, 8)}: ${articles.length} arts, ${uniqueSources.size} srcs, newest=${dates[dates.length - 1]?.slice(0, 16) ?? 'null'}, oldest=${dates[0]?.slice(0, 16) ?? 'null'}`);
      }
    }

    if (inFresh.length > 0) {
      console.log('');
      console.log('  ⚠️ Clusters éligibles DANS les articles frais mais PAS trouvés par reverse lookup:');
      const inFreshButNotReverse = inFresh.filter(id => !reverseCandidateIds.includes(id));
      console.log(`    ${inFreshButNotReverse.length} clusters dans cette catégorie`);
      if (inFreshButNotReverse.length > 0) {
        for (const id of inFreshButNotReverse.slice(0, 3)) {
          const cluster = allCandidates.find(c => c.id === id);
          console.log(`    ${id.slice(0, 8)}: score=${cluster?.final_score} summary=${JSON.stringify(cluster?.summary)}`);
        }
      }
    }
  } else {
    console.log(`  Stats API: ${eligibleIds.length} éligibles | Reverse lookup: ${reverseEligible} éligibles`);
    if (eligibleIds.length === reverseEligible) {
      console.log('  ✅ Pas de desync. Le problème est ailleurs.');
    }
  }
}

main().catch(console.error);
