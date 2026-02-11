import { existsSync } from 'fs';
import { config } from 'dotenv';
import { getServiceSupabase } from '../src/lib/supabase-admin';
import { classifyClusterEditorialState } from '../src/lib/editorial-state';
import { getPublicationConfig, type PublicationOverrides } from '../src/lib/publication-rules';

// Only load .env.local if it exists (local dev). In CI, env vars are injected directly.
if (existsSync('.env.local')) {
  config({ path: '.env.local' });
}

type CountResult = {
  count: number;
  error?: string;
};

type ShouldProcessResult = {
  success: boolean;
  shouldProcess: boolean;
  reasons: string[];
  metrics: {
    pendingEmbedding: number;
    pendingClustering: number;
    pendingScoring: number;
    eligibleRewriting: number;
    candidateRewritingScanned: number;
  };
  error?: string;
};

type RewritingCandidateCluster = {
  id: string;
  created_at: string;
  final_score: number | null;
  is_published: boolean;
  summary: { id: string }[] | null;
};

type ClusterArticleRow = {
  cluster_id: string | null;
  source_name: string | null;
  published_at: string | null;
};

const toNumber = (value?: string) => {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toBool = (value?: string) => {
  if (!value) return undefined;
  return value === 'true' || value === '1';
};

async function countRows(queryBuilder: PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<CountResult> {
  const { count, error } = await queryBuilder;
  if (error) {
    return { count: 0, error: error.message };
  }
  return { count: count ?? 0 };
}

async function hasEligibleRewritingCluster(
  pubOverrides: PublicationOverrides
): Promise<{ eligibleCount: number; scannedCandidates: number; error?: string }> {
  const supabase = getServiceSupabase();
  const pubConfig = getPublicationConfig(pubOverrides);
  const pageSize = 200;
  let offset = 0;
  let scannedCandidates = 0;

  while (true) {
    const { data: clusters, error: clustersError } = await supabase
      .from('clusters')
      .select('id, created_at, final_score, is_published, summary:summaries!summaries_cluster_id_fkey(id)')
      .gte('final_score', pubConfig.publishThreshold)
      .eq('is_published', false)
      .is('summary', null)
      .range(offset, offset + pageSize - 1);

    if (clustersError) {
      return { eligibleCount: 0, scannedCandidates, error: clustersError.message };
    }

    const candidateClusters = (clusters || []) as RewritingCandidateCluster[];
    if (candidateClusters.length === 0) {
      return { eligibleCount: 0, scannedCandidates };
    }

    scannedCandidates += candidateClusters.length;
    const clusterIds = candidateClusters.map((cluster) => cluster.id);

    const { data: articleRows, error: articlesError } = await supabase
      .from('articles')
      .select('cluster_id, source_name, published_at')
      .in('cluster_id', clusterIds);

    if (articlesError) {
      return { eligibleCount: 0, scannedCandidates, error: articlesError.message };
    }

    const groupedArticles = new Map<string, ClusterArticleRow[]>();
    for (const row of (articleRows || []) as ClusterArticleRow[]) {
      if (!row.cluster_id) continue;
      const existing = groupedArticles.get(row.cluster_id);
      if (existing) {
        existing.push(row);
      } else {
        groupedArticles.set(row.cluster_id, [row]);
      }
    }

    for (const cluster of candidateClusters) {
      const articles = groupedArticles.get(cluster.id) || [];
      const classification = classifyClusterEditorialState(
        {
          created_at: cluster.created_at,
          final_score: cluster.final_score,
          is_published: cluster.is_published,
          has_summary: Array.isArray(cluster.summary) ? cluster.summary.length > 0 : false,
          articles: articles.map((article) => ({
            source_name: article.source_name,
            published_at: article.published_at,
          })),
        },
        {
          minScore: pubConfig.publishThreshold,
          minSources: pubConfig.minSources,
          freshOnly: pubConfig.freshOnly,
          freshnessCutoff: pubConfig.freshnessCutoff,
          maturityHours: pubConfig.maturityHours,
          ignoreMaturity: pubConfig.ignoreMaturity,
        }
      );

      if (classification.state === 'eligible_rewriting') {
        return { eligibleCount: 1, scannedCandidates };
      }
    }

    if (candidateClusters.length < pageSize) {
      return { eligibleCount: 0, scannedCandidates };
    }

    offset += pageSize;
  }
}

async function main() {
  const supabase = getServiceSupabase();

  const publicationOverrides: PublicationOverrides = {
    publishThreshold: toNumber(process.env.PUBLISH_THRESHOLD),
    minSources: toNumber(process.env.MIN_SOURCES),
    freshOnly: toBool(process.env.FRESH_ONLY),
    ignoreMaturity: toBool(process.env.IGNORE_MATURITY),
  };

  const pendingEmbedding = await countRows(
    supabase
      .from('articles')
      .select('id', { count: 'exact', head: true })
      .is('embedding', null)
  );
  if (pendingEmbedding.error) {
    console.log(JSON.stringify({
      success: false,
      shouldProcess: true,
      reasons: ['precheck_error_pending_embedding'],
      metrics: {
        pendingEmbedding: 0,
        pendingClustering: 0,
        pendingScoring: 0,
        eligibleRewriting: 0,
        candidateRewritingScanned: 0,
      },
      error: pendingEmbedding.error,
    } satisfies ShouldProcessResult));
    return;
  }

  const pendingClustering = await countRows(
    supabase
      .from('articles')
      .select('id', { count: 'exact', head: true })
      .not('embedding', 'is', null)
      .is('cluster_id', null)
  );
  if (pendingClustering.error) {
    console.log(JSON.stringify({
      success: false,
      shouldProcess: true,
      reasons: ['precheck_error_pending_clustering'],
      metrics: {
        pendingEmbedding: pendingEmbedding.count,
        pendingClustering: 0,
        pendingScoring: 0,
        eligibleRewriting: 0,
        candidateRewritingScanned: 0,
      },
      error: pendingClustering.error,
    } satisfies ShouldProcessResult));
    return;
  }

  const pendingScoring = await countRows(
    supabase
      .from('clusters')
      .select('id', { count: 'exact', head: true })
      .is('final_score', null)
  );
  if (pendingScoring.error) {
    console.log(JSON.stringify({
      success: false,
      shouldProcess: true,
      reasons: ['precheck_error_pending_scoring'],
      metrics: {
        pendingEmbedding: pendingEmbedding.count,
        pendingClustering: pendingClustering.count,
        pendingScoring: 0,
        eligibleRewriting: 0,
        candidateRewritingScanned: 0,
      },
      error: pendingScoring.error,
    } satisfies ShouldProcessResult));
    return;
  }

  const reasons: string[] = [];
  if (pendingEmbedding.count > 0) reasons.push('pending_embedding');
  if (pendingClustering.count > 0) reasons.push('pending_clustering');
  if (pendingScoring.count > 0) reasons.push('pending_scoring');

  let eligibleRewriting = 0;
  let candidateRewritingScanned = 0;
  let precheckError: string | undefined;

  if (reasons.length === 0) {
    const rewriteScan = await hasEligibleRewritingCluster(publicationOverrides);
    candidateRewritingScanned = rewriteScan.scannedCandidates;
    eligibleRewriting = rewriteScan.eligibleCount;
    precheckError = rewriteScan.error;
    if (eligibleRewriting > 0) reasons.push('eligible_rewriting');
  }

  const shouldProcess = reasons.length > 0 || !!precheckError;

  const result: ShouldProcessResult = {
    success: !precheckError,
    shouldProcess,
    reasons: precheckError ? ['precheck_error_rewriting', ...reasons] : reasons,
    metrics: {
      pendingEmbedding: pendingEmbedding.count,
      pendingClustering: pendingClustering.count,
      pendingScoring: pendingScoring.count,
      eligibleRewriting,
      candidateRewritingScanned,
    },
    error: precheckError,
  };

  console.log(JSON.stringify(result));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.log(JSON.stringify({
    success: false,
    shouldProcess: true,
    reasons: ['precheck_unhandled_error'],
    metrics: {
      pendingEmbedding: 0,
      pendingClustering: 0,
      pendingScoring: 0,
      eligibleRewriting: 0,
      candidateRewritingScanned: 0,
    },
    error: message,
  } satisfies ShouldProcessResult));
});
