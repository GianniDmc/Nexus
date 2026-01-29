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
        const search = searchParams.get('search') || '';
        const source = searchParams.get('source') || 'all';

        let query = supabase
            .from('articles')
            .select('*', { count: 'estimated' });

        if (search) {
            query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`);
        }

        if (source && source !== 'all') {
            query = query.eq('source_name', source);
        }

        const cluster_id = searchParams.get('cluster_id');
        if (cluster_id) {
            query = query.eq('cluster_id', cluster_id);
        }

        const from = (page - 1) * limit;
        const to = from + limit - 1;

        query = query
            .order('published_at', { ascending: false })
            .range(from, to);

        const { data, error, count } = await query;

        if (error) throw error;

        // Manually fetch cluster labels if needed to avoid Join issues
        let articles = data || [];
        if (articles.length > 0) {
            const clusterIds = Array.from(new Set(articles.map((a: any) => a.cluster_id).filter(Boolean)));
            if (clusterIds.length > 0) {
                const { data: clusters } = await supabase
                    .from('clusters')
                    .select('id, label')
                    .in('id', clusterIds);

                const clusterMap = new Map(clusters?.map((c: any) => [c.id, c.label]) || []);

                articles = articles.map((a: any) => ({
                    ...a,
                    cluster: a.cluster_id ? { label: clusterMap.get(a.cluster_id) } : null
                }));
            }
        }

        return NextResponse.json({
            articles,
            total: count,
            page,
            totalPages: count ? Math.ceil(count / limit) : 0
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
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
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
