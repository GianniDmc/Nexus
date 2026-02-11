export type EditorialState =
  | 'published'
  | 'pending_scoring'
  | 'low_score'
  | 'anomaly_empty'
  | 'anomaly_summary_unpublished'
  | 'archived'
  | 'incubating_maturity_sources'
  | 'incubating_maturity'
  | 'incubating_sources'
  | 'eligible_rewriting';

export type EditorialBlockReason =
  | 'none'
  | 'stale'
  | 'maturity'
  | 'sources'
  | 'maturity_and_sources'
  | 'empty_cluster'
  | 'summary_unpublished';

export interface EditorialArticle {
  source_name: string | null;
  published_at: string | null;
}

export interface EditorialClusterInput {
  created_at?: string | null;
  final_score: number | null;
  is_published: boolean;
  has_summary: boolean;
  articles: EditorialArticle[];
}

export interface EditorialConfig {
  minScore: number;
  minSources: number;
  freshOnly: boolean;
  freshnessCutoff: string;
  maturityHours: number;
  ignoreMaturity?: boolean;
}

export interface EditorialClusterMetrics {
  article_count: number;
  unique_sources: number;
  has_fresh_article: boolean;
  is_mature: boolean;
  newest_article_at: string | null;
  oldest_article_at: string | null;
  block_reason: EditorialBlockReason;
}

export interface EditorialClassification {
  state: EditorialState;
  metrics: EditorialClusterMetrics;
}

export type EditorialFilter =
  | 'all'
  | 'published'
  | 'pending'
  | 'pending_scoring'
  | 'low_score'
  | 'ready'
  | 'eligible'
  | 'eligible_rewriting'
  | 'incubating'
  | 'incubating_maturity'
  | 'incubating_sources'
  | 'archived'
  | 'anomalies';

const MATURITY_STATES: EditorialState[] = ['incubating_maturity'];
const SOURCE_STATES: EditorialState[] = ['incubating_sources', 'incubating_maturity_sources'];
const ANOMALY_STATES: EditorialState[] = ['anomaly_empty', 'anomaly_summary_unpublished'];

export function getFilterStates(filter: string | null | undefined): EditorialState[] | null {
  const normalized = (filter || 'all') as EditorialFilter;

  switch (normalized) {
    case 'all':
      return null;
    case 'published':
      return ['published'];
    case 'pending':
    case 'pending_scoring':
      return ['pending_scoring'];
    case 'low_score':
      return ['low_score'];
    case 'ready':
      // Backward-compatible alias: "ready" now maps to unpublished clusters with summary anomalies.
      return ['anomaly_summary_unpublished'];
    case 'eligible':
    case 'eligible_rewriting':
      return ['eligible_rewriting'];
    case 'incubating':
      return ['incubating_maturity', 'incubating_sources', 'incubating_maturity_sources'];
    case 'incubating_maturity':
      return ['incubating_maturity'];
    case 'incubating_sources':
      return ['incubating_sources', 'incubating_maturity_sources'];
    case 'archived':
      return ['archived'];
    case 'anomalies':
      return ANOMALY_STATES;
    default:
      return null;
  }
}

export function isMaturityState(state: EditorialState): boolean {
  return MATURITY_STATES.includes(state);
}

export function isSourceState(state: EditorialState): boolean {
  return SOURCE_STATES.includes(state);
}

export function isAnomalyState(state: EditorialState): boolean {
  return ANOMALY_STATES.includes(state);
}

function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : null;
}

function formatIso(ts: number | null): string | null {
  if (ts === null) return null;
  return new Date(ts).toISOString();
}

export function classifyClusterEditorialState(
  cluster: EditorialClusterInput,
  config: EditorialConfig,
  nowTs: number = Date.now()
): EditorialClassification {
  const article_count = cluster.articles.length;
  const unique_sources = new Set(
    cluster.articles
      .map((article) => article.source_name?.trim())
      .filter((source): source is string => Boolean(source))
  ).size;

  const articleTimes = cluster.articles
    .map((article) => parseTimestamp(article.published_at))
    .filter((ts): ts is number => ts !== null);

  const newestTs = articleTimes.length > 0 ? Math.max(...articleTimes) : null;
  const oldestTs = articleTimes.length > 0 ? Math.min(...articleTimes) : null;
  const clusterCreatedTs = parseTimestamp(cluster.created_at);

  const freshnessCutoffTs = parseTimestamp(config.freshnessCutoff) ?? nowTs;
  const has_fresh_article = config.freshOnly ? newestTs !== null && newestTs >= freshnessCutoffTs : true;

  const maturityCutoffTs = nowTs - config.maturityHours * 60 * 60 * 1000;
  const maturityBypass = config.ignoreMaturity === true || config.maturityHours <= 0;
  // Maturity is based on story age: first published article in the cluster.
  // Fallback to cluster creation date only when article dates are missing.
  const maturityAnchorTs = oldestTs ?? clusterCreatedTs;
  const is_mature = maturityBypass ? true : maturityAnchorTs !== null && maturityAnchorTs <= maturityCutoffTs;

  const baseMetrics: Omit<EditorialClusterMetrics, 'block_reason'> = {
    article_count,
    unique_sources,
    has_fresh_article,
    is_mature,
    newest_article_at: formatIso(newestTs),
    oldest_article_at: formatIso(oldestTs),
  };

  if (cluster.is_published) {
    return { state: 'published', metrics: { ...baseMetrics, block_reason: 'none' } };
  }

  if (cluster.final_score === null) {
    return { state: 'pending_scoring', metrics: { ...baseMetrics, block_reason: 'none' } };
  }

  if (cluster.final_score < config.minScore) {
    return { state: 'low_score', metrics: { ...baseMetrics, block_reason: 'none' } };
  }

  if (article_count === 0) {
    return { state: 'anomaly_empty', metrics: { ...baseMetrics, block_reason: 'empty_cluster' } };
  }

  if (cluster.has_summary) {
    return {
      state: 'anomaly_summary_unpublished',
      metrics: { ...baseMetrics, block_reason: 'summary_unpublished' },
    };
  }

  if (config.freshOnly && !has_fresh_article) {
    return { state: 'archived', metrics: { ...baseMetrics, block_reason: 'stale' } };
  }

  const maturityBlocked = !is_mature;
  const sourcesBlocked = unique_sources < config.minSources;

  if (maturityBlocked && sourcesBlocked) {
    return {
      state: 'incubating_maturity_sources',
      metrics: { ...baseMetrics, block_reason: 'maturity_and_sources' },
    };
  }

  if (maturityBlocked) {
    return {
      state: 'incubating_maturity',
      metrics: { ...baseMetrics, block_reason: 'maturity' },
    };
  }

  if (sourcesBlocked) {
    return {
      state: 'incubating_sources',
      metrics: { ...baseMetrics, block_reason: 'sources' },
    };
  }

  return {
    state: 'eligible_rewriting',
    metrics: { ...baseMetrics, block_reason: 'none' },
  };
}
