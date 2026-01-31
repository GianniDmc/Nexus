
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

        console.log(`[API-ADMIN] GET /articles status=${status} page=${page} search='${search}'`);

        // Freshness Logic (Reverse Lookup)
        let freshClusterIds: string[] | null = null;
        const needsFreshness = ['eligible', 'incubating', 'archived'].includes(status);

        if (needsFreshness) {
            const cutoff = getFreshnessCutoff();
            console.log(`[API-ADMIN] fetching fresh articles since ${cutoff} for status ${status}`);
            const { data: fresh } = await supabase
                .from('articles')
                .select('cluster_id')
                .gte('published_at', cutoff)
                .order('published_at', { ascending: false })
                .limit(500);

            if (fresh) {
                const unique = Array.from(new Set(fresh.map(a => a.cluster_id).filter(id => id !== null)));
                // Limit to top 80 to avoid URL length limits
                freshClusterIds = unique.slice(0, 80) as string[];
            }
        }

        // Base Query
        let query = supabase
            .from('clusters')
            .select(`
                *,
                articles:articles!articles_cluster_id_fkey(count),
                summary:summaries!summaries_cluster_id_fkey(*)
            `, { count: 'estimated' });

        // MUTUALLY EXCLUSIVE FILTERS
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
                if (freshClusterIds) query = query.in('id', freshClusterIds);
                query = query
                    .eq('is_published', false)
                    .gte('final_score', PUBLICATION_RULES.PUBLISH_THRESHOLD)
                    .is('summary', null);
                break;

            case 'incubating':
                // 🟡 Incubation: Fresh + Valid Score + No Summary + (Sources checked in post-filter)
                if (freshClusterIds) query = query.in('id', freshClusterIds);
                query = query
                    .eq('is_published', false)
                    .gte('final_score', PUBLICATION_RULES.PUBLISH_THRESHOLD)
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
                // Optimized: Instead of "NOT IN fresh", we use "Old date".
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

        console.log(`[API-ADMIN] DB returned ${data?.length} rows (Total matching DB: ${dbCount})`);

        // Transform & Post-Filter
        let clusters = data?.map((c: any) => ({
            ...c,
            title: c.label,
            cluster_size: c.articles?.[0]?.count || 0,
            summary_short: c.summary ? JSON.stringify({
                title: c.summary.title,
                tldr: c.summary.content_tldr,
                full: c.summary.content_full
            }) : null,
            published_on: c.published_on
        })) || [];

        // STRICT JS FILTERS (Pipeline Logic) for Source Counts
        if (status === 'eligible') {
            const beforeCount = clusters.length;
            clusters = clusters.filter((c: any) => c.cluster_size >= PUBLICATION_RULES.MIN_SOURCES);
            console.log(`[API-ADMIN] Post-Filter 'eligible' (Sources >= ${PUBLICATION_RULES.MIN_SOURCES}): ${beforeCount} -> ${clusters.length}`);
        } else if (status === 'incubating') {
            const beforeCount = clusters.length;
            clusters = clusters.filter((c: any) => c.cluster_size < PUBLICATION_RULES.MIN_SOURCES);
            console.log(`[API-ADMIN] Post-Filter 'incubating' (Sources < ${PUBLICATION_RULES.MIN_SOURCES}): ${beforeCount} -> ${clusters.length}`);
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
            console.log(`[API-ADMIN] In-Memory Slice: ${from} to ${from + limit} (Returned: ${clusters.length})`);
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
