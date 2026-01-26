import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { PUBLICATION_RULES } from '@/lib/publication-rules';

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

        // Query CLUSTERS with explicit foreign key for articles count AND summary
        let query = supabase
            .from('clusters')
            .select(`
                *,
                articles:articles!articles_cluster_id_fkey(count),
                summary:summaries!summaries_cluster_id_fkey(*)
            `, { count: 'estimated' });

        // Apply Status Filters
        if (status === 'relevant') {
            query = query.gte('final_score', PUBLICATION_RULES.PUBLISH_THRESHOLD);
        } else if (status === 'low_score') {
            query = query.lt('final_score', PUBLICATION_RULES.PUBLISH_THRESHOLD).not('final_score', 'is', null);
        } else if (status === 'pending') {
            query = query.is('final_score', null);
        } else if (status === 'ready') {
            // Ready = Scored >= Threshold, Not Published. 
            // We apply Score + Published limit used by Cron here. 
            // Additional checks (Maturity, Sources, Summary) are safer done as post-filter 
            // because of JOIN complexities with Supabase simple filters.
            query = query.gte('final_score', PUBLICATION_RULES.PUBLISH_THRESHOLD)
                .eq('is_published', false);
        } else if (status === 'published') {
            query = query.eq('is_published', true);
        }

        if (search) {
            query = query.ilike('label', `%${search}%`);
        }

        const sort = searchParams.get('sort') || 'created_at';
        const order = searchParams.get('order') || 'desc';

        // Fix sort field mapping
        let sortField = sort;
        // if (sort === 'published_at') sortField = 'created_at'; // REMOVED to allow sorting by published_on/published_at if column exists
        // actually column is 'published_on' in DB, 'created_at' for cluster.
        // UI sends 'created_at' mostly. If UI sends 'published_on', we use it.
        // We verify the column exists to avoid SQL injection/errors, but Supabase query builder handles column names safely mostly if valid.
        // Let's just allow it passing through.

        const isManualSort = sortField === 'cluster_size';

        // Apply Native Sort if not manual
        if (!isManualSort) {
            query = query.order(sortField, { ascending: order === 'asc' });

            const from = (page - 1) * limit;
            const to = from + limit - 1;
            query = query.range(from, to);
        }

        const { data, error, count } = await query;

        if (error) throw error;

        // Transform
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

        // Strict Post-Filter for 'ready' status
        if (status === 'ready') {
            const now = Date.now();
            const maturityMillis = PUBLICATION_RULES.CLUSTER_MATURITY_HOURS * 60 * 60 * 1000;
            const minSources = PUBLICATION_RULES.MIN_SOURCES;

            clusters = clusters.filter((c: any) => {
                // 1. Must have summary
                if (!c.summary_short) return false;
                // 2. Min Sources
                if (c.cluster_size < minSources) return false;
                // 3. Maturity
                const age = now - new Date(c.created_at).getTime();
                if (age < maturityMillis) return false;

                return true;
            });
        }

        // Manual Sort & Pagination (if cluster_size)
        if (isManualSort) {
            clusters.sort((a, b) => {
                return order === 'asc'
                    ? a.cluster_size - b.cluster_size
                    : b.cluster_size - a.cluster_size;
            });
            // Manual Pagination
            const from = (page - 1) * limit;
            clusters = clusters.slice(from, from + limit);
        }

        return NextResponse.json({
            clusters,
            total: count,
            page,
            totalPages: count ? Math.ceil(count / limit) : 0
        });

    } catch (error: any) {
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
