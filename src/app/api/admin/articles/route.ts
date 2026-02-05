
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { PUBLICATION_RULES, getFreshnessCutoff } from '@/lib/publication-rules';

export const dynamic = 'force-dynamic';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '50');
        const status = searchParams.get('status') || 'all';
        const search = searchParams.get('search') || '';

        // Freshness Logic (Reverse Lookup)
        let freshClusterIds: string[] | null = null;
        const needsFreshness = ['eligible', 'incubating', 'archived'].includes(status);

        if (needsFreshness) {
            const cutoff = getFreshnessCutoff();

            // PAGINATION LOOP to bypass Supabase 1000 rows limit
            let allFreshClusterIds: string[] = [];
            let offset = 0;
            const pageSize = 1000;
            let hasMore = true;

            while (hasMore) {
                const { data: batch } = await supabase
                    .from('articles')
                    .select('cluster_id')
                    .gte('published_at', cutoff)
                    .range(offset, offset + pageSize - 1);

                if (batch && batch.length > 0) {
                    const ids = batch.map(a => a.cluster_id).filter(Boolean) as string[];
                    allFreshClusterIds.push(...ids);

                    if (batch.length < pageSize) {
                        hasMore = false;
                    } else {
                        offset += pageSize;
                    }
                } else {
                    hasMore = false;
                }
            }

            // Deduplicate and assign to the outer variable
            freshClusterIds = Array.from(new Set(allFreshClusterIds));
        }

        // Base Query
        let query = supabase
            .from('clusters')
            .select(`
                *,
                articles:articles!articles_cluster_id_fkey(source_name),
                summary:summaries!summaries_cluster_id_fkey(*)
            `, { count: 'estimated' });

        // MUTUALLY EXCLUSIVE FILTERS
        // Helper date for safety bound (scan only last 30 days to avoid fetching full history)
        const safeHistoryLimit = new Date();
        safeHistoryLimit.setDate(safeHistoryLimit.getDate() - 35); // 30 days + margin

        switch (status) {
            case 'published':
                query = query.eq('is_published', true);
                break;

            case 'ready':
                // 🔵 Prêts à Publier: Valid Score + Summary + Not Published
                query = query
                    .eq('is_published', false)
                    .gte('final_score', PUBLICATION_RULES.PUBLISH_THRESHOLD)
                    .not('summary', 'is', null);
                break;

            case 'eligible':
                // 🟣 File d'Attente: Fresh + Valid Score + No Summary + Enough Sources
                // Optimization: Don't use .in(huge_array) to avoid URL overflow. 
                // Fetch candidate clusters from last month, then filter by freshness in JS.
                query = query
                    .eq('is_published', false)
                    .gte('final_score', PUBLICATION_RULES.PUBLISH_THRESHOLD)
                    .gte('created_at', safeHistoryLimit.toISOString())
                    .is('summary', null);
                break;

            case 'incubating':
                // 🟡 Incubation: Fresh + Valid Score + No Summary + (Sources checked in post-filter)
                query = query
                    .eq('is_published', false)
                    .gte('final_score', PUBLICATION_RULES.PUBLISH_THRESHOLD)
                    .gte('created_at', safeHistoryLimit.toISOString())
                    .is('summary', null);
                break;

            case 'pending':
                // ⏳ En Attente (IA): Not scored yet
                query = query
                    .eq('is_published', false)
                    .is('final_score', null);
                break;

            case 'archived':
                // 🟤 Archives: Stale + Valid Score + No Summary
                const cutoff = getFreshnessCutoff();
                query = query
                    .eq('is_published', false)
                    .gte('final_score', PUBLICATION_RULES.PUBLISH_THRESHOLD)
                    .is('summary', null)
                    .lt('created_at', cutoff); // Strictly older than cutoff
                break;

            case 'low_score':
                // ⚪ Poubelle: Low Score
                query = query
                    .eq('is_published', false)
                    .lt('final_score', PUBLICATION_RULES.PUBLISH_THRESHOLD);
                break;

            case 'all':
            default:
                // No specific filter
                break;
        }

        if (search) {
            query = query.ilike('label', `%${search}%`);
        }

        const sort = searchParams.get('sort') || 'created_at';
        const order = searchParams.get('order') || 'desc';
        const sortField = sort;

        const isManualSort = sortField === 'cluster_size';
        // Pagination Strategy: In-Memory if we apply JS post-filters
        // New Workflow: 'eligible' and 'incubating' need JS checks for source counts
        const isPostFiltered = ['eligible', 'incubating'].includes(status);
        const shouldPaginateInMemory = isManualSort || isPostFiltered;

        // Apply Native Sort/Pagination if NOT using In-Memory logic
        if (!shouldPaginateInMemory) {
            query = query.order(sortField, { ascending: order === 'asc' });

            const from = (page - 1) * limit;
            const to = from + limit - 1;
            query = query.range(from, to);
        } else {
            // Even for In-Memory, default DB sort helps (e.g. by created_at)
            // unless isManualSort which overrides it later
            if (!isManualSort) {
                query = query.order(sortField, { ascending: order === 'asc' });
            }
        }

        const { data, error, count: dbCount } = await query;

        if (error) throw error;

        // Transform & Post-Filter
        let clusters = data?.map((c: any) => ({
            ...c,
            title: c.label,
            // Calculate sizes
            cluster_size: c.articles?.length || 0, // Total articles
            unique_sources: new Set(c.articles?.map((a: any) => a.source_name)).size, // Unique sources

            summary_short: c.summary ? JSON.stringify({
                title: c.summary.title,
                tldr: c.summary.content_tldr,
                full: c.summary.content_full
            }) : null,
            published_on: c.published_on
        })) || [];

        // STRICT JS FILTERS (Pipeline Logic) for Source Counts AND Freshness
        if (status === 'eligible') {
            const freshSet = new Set(freshClusterIds || []);
            // RULES: Eligible = Enough UNIQUE sources AND Fresh
            clusters = clusters.filter((c: any) =>
                c.unique_sources >= PUBLICATION_RULES.MIN_SOURCES &&
                freshSet.has(c.id)
            );
        } else if (status === 'incubating') {
            const freshSet = new Set(freshClusterIds || []);
            // RULES: Incubating = NOT enough UNIQUE sources (but valid score) AND Fresh
            clusters = clusters.filter((c: any) =>
                c.unique_sources < PUBLICATION_RULES.MIN_SOURCES &&
                freshSet.has(c.id)
            );
        }

        // Calculate Total & Slice (if In-Memory)
        const total = shouldPaginateInMemory ? clusters.length : (dbCount || 0);

        if (shouldPaginateInMemory) {
            if (isManualSort) {
                clusters.sort((a, b) => {
                    return order === 'asc'
                        ? a.cluster_size - b.cluster_size
                        : b.cluster_size - a.cluster_size;
                });
            }
            // Paginate
            const from = (page - 1) * limit;
            clusters = clusters.slice(from, from + limit);
        }

        return NextResponse.json({
            clusters,
            total,
            page,
            totalPages: total ? Math.ceil(total / limit) : 0
        });

    } catch (error: any) {
        console.error("[API-ADMIN] Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    try {
        const { id, ids, updates } = await request.json();

        // Target CLUSTERS
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
    } catch (error) {
        return NextResponse.json({ error: 'Failed to update cluster(s)' }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) throw new Error('ID required');

        const { error } = await supabase
            .from('clusters') // Delete Cluster
            .delete()
            .eq('id', id);

        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to delete cluster' }, { status: 500 });
    }
}
