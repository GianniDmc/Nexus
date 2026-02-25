import { getServiceSupabase } from '@/lib/supabase-admin';
import { NextResponse } from 'next/server';
import { PUBLICATION_RULES, getFreshnessCutoff } from '@/lib/publication-rules';
import { parseBoundedInt } from '@/lib/http';
import { classifyClusterEditorialState, getFilterStates } from '@/lib/editorial-state';

export const dynamic = 'force-dynamic';

const supabase = getServiceSupabase();

type DbSummaryRow = {
  title: string | null;
  content_tldr: string | null;
  content_full: string | null;
} | null;

type DbArticleRow = {
  source_name: string | null;
  published_at: string | null;
};

type DbClusterRow = {
  id: string;
  label: string;
  created_at: string;
  final_score: number | null;
  is_published: boolean;
  image_url: string | null;
  published_on: string | null;
  articles: DbArticleRow[] | null;
  summary: DbSummaryRow | DbSummaryRow[] | null;
};

type AdminClusterRow = {
  id: string;
  title: string;
  created_at: string;
  final_score: number | null;
  summary_short: string | null;
  cluster_size: number;
  unique_sources: number;
  is_published: boolean;
  image_url: string | null;
  published_on: string | null;
  editorial_state: string;
  block_reason: string;
};

function getSummaryRecord(summary: DbSummaryRow | DbSummaryRow[] | null): DbSummaryRow {
  if (Array.isArray(summary)) {
    return summary[0] || null;
  }
  return summary || null;
}

function sortClusters(
  clusters: AdminClusterRow[],
  sortField: string,
  order: 'asc' | 'desc'
): AdminClusterRow[] {
  const direction = order === 'asc' ? 1 : -1;
  const toTs = (value: string | null | undefined) => {
    if (!value) return 0;
    const ts = new Date(value).getTime();
    return Number.isFinite(ts) ? ts : 0;
  };

  return clusters.sort((a, b) => {
    let cmp = 0;

    if (sortField === 'cluster_size') {
      cmp = a.cluster_size - b.cluster_size;
    } else if (sortField === 'final_score') {
      cmp = (a.final_score ?? -Infinity) - (b.final_score ?? -Infinity);
    } else if (sortField === 'published_on') {
      cmp = toTs(a.published_on) - toTs(b.published_on);
    } else if (sortField === 'title' || sortField === 'label') {
      cmp = a.title.localeCompare(b.title, 'fr', { sensitivity: 'base' });
    } else {
      cmp = toTs(a.created_at) - toTs(b.created_at);
    }

    return cmp * direction;
  });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseBoundedInt(searchParams.get('page'), 1, 1, 100000);
    const limit = parseBoundedInt(searchParams.get('limit'), 50, 1, 200);
    const status = searchParams.get('status') || 'all';
    const search = searchParams.get('search') || '';
    const sortBy = searchParams.get('sort') || 'created_at';
    const sortOrder = searchParams.get('order') === 'asc' ? 'asc' : 'desc';
    const freshOnly = searchParams.has('freshOnly')
      ? searchParams.get('freshOnly') !== 'false'
      : PUBLICATION_RULES.FRESH_ONLY_DEFAULT;
    const minSources = searchParams.has('minSources')
      ? parseBoundedInt(searchParams.get('minSources'), PUBLICATION_RULES.MIN_SOURCES, 1, 20)
      : PUBLICATION_RULES.MIN_SOURCES;
    const minScore = searchParams.has('minScore')
      ? parseFloat(searchParams.get('minScore') || String(PUBLICATION_RULES.PUBLISH_THRESHOLD))
      : PUBLICATION_RULES.PUBLISH_THRESHOLD;
    const effectiveMinScore = Number.isFinite(minScore) ? minScore : PUBLICATION_RULES.PUBLISH_THRESHOLD;

    const selectFields = `
      id,
      label,
      created_at,
      final_score,
      is_published,
      image_url,
      published_on,
      articles:articles!articles_cluster_id_fkey(source_name, published_at),
      summary:summaries!summaries_cluster_id_fkey(title, content_tldr, content_full)
    `;

    // --------------- SQL pre-filter by editorial status ---------------
    // Mirrors the editorial state machine to reduce data loaded from DB.
    // The in-memory classifier still runs for exact metrics on the subset.
    const buildQuery = (offset: number, pageSize: number) => {
      let query = supabase
        .from('clusters')
        .select(selectFields, { count: 'estimated' })
        .order('created_at', { ascending: false });

      if (search) {
        query = query.ilike('label', `%${search}%`);
      }

      // Pré-filtre SQL selon l'état éditorial demandé
      switch (status) {
        case 'published':
          query = query.eq('is_published', true);
          break;
        case 'eligible':
        case 'eligible_rewriting':
          // Score OK, pas publié — freshness/maturity/sources vérifiées en mémoire
          query = query
            .eq('is_published', false)
            .gte('final_score', effectiveMinScore);
          break;
        case 'incubating':
        case 'incubating_maturity':
        case 'incubating_sources':
        case 'incubating_maturity_sources':
          // Score OK, pas publié — détail maturity vs sources vérifié en mémoire
          query = query
            .eq('is_published', false)
            .gte('final_score', effectiveMinScore);
          break;
        case 'low_score':
          query = query
            .eq('is_published', false)
            .not('final_score', 'is', null)
            .lt('final_score', effectiveMinScore);
          break;
        case 'pending':
        case 'pending_scoring':
          query = query
            .eq('is_published', false)
            .is('final_score', null);
          break;
        case 'archived':
          query = query
            .eq('is_published', false)
            .gte('final_score', effectiveMinScore);
          break;
        case 'anomalies':
        case 'anomaly_empty':
        case 'anomaly_summary_unpublished':
        case 'ready':
          // Anomalies / ready : pas publié, score OK
          query = query
            .eq('is_published', false)
            .gte('final_score', effectiveMinScore);
          break;
        // 'all' → pas de pré-filtre
      }

      return query.range(offset, offset + pageSize - 1);
    };

    // Chargement paginé (1000 par batch côté DB)
    // Pour 'all', on limite à 500 clusters max pour éviter les timeouts
    const maxRows = status === 'all' ? 500 : Infinity;
    const pageSize = 1000;
    const allRows: DbClusterRow[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore && allRows.length < maxRows) {
      const batchSize = Math.min(pageSize, maxRows - allRows.length);
      const { data: batch, error } = await buildQuery(offset, batchSize);
      if (error) throw error;

      if (batch && batch.length > 0) {
        allRows.push(...(batch as DbClusterRow[]));
        if (batch.length < pageSize) {
          hasMore = false;
        } else {
          offset += pageSize;
        }
      } else {
        hasMore = false;
      }
    }

    const allowedStates = getFilterStates(status);
    const classificationConfig = {
      minScore: effectiveMinScore,
      minSources,
      freshOnly,
      freshnessCutoff: getFreshnessCutoff(),
      maturityHours: PUBLICATION_RULES.CLUSTER_MATURITY_HOURS,
      ignoreMaturity: false,
    };

    let clusters: AdminClusterRow[] = allRows.map((cluster) => {
      const summaryRecord = getSummaryRecord(cluster.summary);
      const articles = Array.isArray(cluster.articles) ? cluster.articles : [];
      const classification = classifyClusterEditorialState(
        {
          created_at: cluster.created_at,
          final_score: cluster.final_score,
          is_published: cluster.is_published,
          has_summary: !!summaryRecord,
          articles: articles.map((article) => ({
            source_name: article.source_name,
            published_at: article.published_at,
          })),
        },
        classificationConfig
      );

      return {
        id: cluster.id,
        title: cluster.label,
        created_at: cluster.created_at,
        final_score: cluster.final_score,
        summary_short: summaryRecord
          ? JSON.stringify({
            title: summaryRecord.title,
            tldr: summaryRecord.content_tldr,
            full: summaryRecord.content_full,
          })
          : null,
        cluster_size: classification.metrics.article_count,
        unique_sources: classification.metrics.unique_sources,
        is_published: cluster.is_published,
        image_url: cluster.image_url,
        published_on: cluster.published_on,
        editorial_state: classification.state,
        block_reason: classification.metrics.block_reason,
      };
    });

    // Affinage en mémoire : le pré-filtre SQL est large, la classification TS est exacte
    if (allowedStates) {
      const stateSet = new Set<string>(allowedStates);
      clusters = clusters.filter((cluster) => stateSet.has(cluster.editorial_state));
    }

    sortClusters(clusters, sortBy, sortOrder);

    const total = clusters.length;
    const from = (page - 1) * limit;
    const pagedClusters = clusters.slice(from, from + limit);

    return NextResponse.json({
      clusters: pagedClusters,
      total,
      page,
      totalPages: total ? Math.ceil(total / limit) : 0,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API-ADMIN] Error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { id, ids, updates } = await request.json();

    const startQuery = supabase.from('clusters').update(updates);

    let query;
    if (ids && Array.isArray(ids) && ids.length > 0) {
      query = startQuery.in('id', ids);
    } else if (id) {
      query = startQuery.eq('id', id);
    } else {
      throw new Error('ID or IDs required');
    }

    const { data, error } = await query.select();
    if (error) throw error;

    return NextResponse.json({ success: true, clusters: data });
  } catch {
    return NextResponse.json({ error: 'Failed to update cluster(s)' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) throw new Error('ID required');

    const { error } = await supabase.from('clusters').delete().eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete cluster' }, { status: 500 });
  }
}
