import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '50');
        const status = searchParams.get('status') || 'all'; // all, published, rejected, pending (needs review)
        const search = searchParams.get('search') || '';

        let query = supabase
            .from('articles')
            .select('*', { count: 'estimated' });

        // Apply Filter Status
        if (status === 'published') {
            // Assuming published means it has a final_score and wasn't rejected ? 
            // Or maybe we add a 'status' column later? 
            // For now based on current logic:
            // Published = final_score >= 7 (approx) or manually flagged?
            // Actually, let's use the explicit 'is_published' if we had it, but we don't.
            // We rely on score. BUT, let's assume we want to view everything.

            // Let's stick to the definition:
            // Relevant (Published) = final_score >= 6 (or whatever threshold) AND (status is not rejected if we had that)
            // For Admin, it's better to filter by score ranges or explicit actions.

            // Let's deduce "Status" from existing fields:
            // - Published: item.final_score >= 6
            // - Rejected: item.final_score < 6 (or explicitly ignored?)
            // - Pending: final_score is null

            // However, we might want to manually override.
            // Let's look at schema. We don't have a status column yet.
            // For now, let's just default to sorting/search and simple score filtering if needed.
        }

        // Let's implement filters based on what we have
        if (status === 'relevant') {
            query = query.gte('final_score', 6);
        } else if (status === 'low_score') {
            query = query.lt('final_score', 6).not('final_score', 'is', null);
        } else if (status === 'pending') {
            query = query.is('final_score', null);
        } else if (status === 'ready') {
            // Articles processed (summary exists) but not published AND decent score
            query = query.not('summary_short', 'is', null).eq('is_published', false).gte('final_score', 4);
        } else if (status === 'published') {
            query = query.eq('is_published', true);
        }

        if (search) {
            query = query.ilike('title', `%${search}%`);
        }

        const sort = searchParams.get('sort') || 'published_at';
        const order = searchParams.get('order') || 'desc';

        // ... filters ...

        if (search) {
            query = query.ilike('title', `%${search}%`);
        }

        // Dynamic Sort
        query = query.order(sort, { ascending: order === 'asc' });

        // Pagination
        const from = (page - 1) * limit;
        const to = from + limit - 1;
        query = query.range(from, to);

        const { data, error, count } = await query;

        if (error) throw error;

        // Enrich with cluster_size (count articles per cluster)
        const clusterIds = [...new Set(data?.map(a => a.cluster_id).filter(Boolean) || [])];
        const clusterSizes: Record<string, number> = {};

        if (clusterIds.length > 0) {
            const { data: clusterArticles } = await supabase
                .from('articles')
                .select('cluster_id')
                .in('cluster_id', clusterIds);

            clusterArticles?.forEach(a => {
                if (a.cluster_id) clusterSizes[a.cluster_id] = (clusterSizes[a.cluster_id] || 0) + 1;
            });
        }

        const enrichedArticles = data?.map(article => ({
            ...article,
            cluster_size: article.cluster_id ? (clusterSizes[article.cluster_id] || 1) : 0
        }));

        return NextResponse.json({
            articles: enrichedArticles,
            total: count,
            page,
            totalPages: count ? Math.ceil(count / limit) : 0
        });

    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch articles' }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    try {
        const { id, ids, updates } = await request.json();

        // Support both single ID and multiple IDs
        const startQuery = supabase.from('articles').update(updates);

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

        return NextResponse.json({ success: true, articles: data });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to update article(s)' }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) throw new Error('ID required');

        const { error } = await supabase
            .from('articles')
            .delete()
            .eq('id', id);

        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to delete article' }, { status: 500 });
    }
}
