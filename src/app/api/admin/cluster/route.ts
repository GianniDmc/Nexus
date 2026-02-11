import { getServiceSupabase } from '@/lib/supabase-admin';
import { NextResponse } from 'next/server';

const supabase = getServiceSupabase();

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const clusterId = searchParams.get('clusterId');

        if (!clusterId) {
            return NextResponse.json({ error: 'clusterId required' }, { status: 400 });
        }

        const { data: articles, error } = await supabase
            .from('articles')
            .select('id, title, source_name, source_url, published_at, final_score')
            .eq('cluster_id', clusterId)
            .order('final_score', { ascending: false, nullsFirst: false });

        if (error) throw error;

        // Map for UI consumption
        const mappedArticles = articles?.map(a => ({
            id: a.id,
            title: a.title,
            source: a.source_name,
            source_name: a.source_name, // Explicit mapping for key consistency
            url: a.source_url,
            source_url: a.source_url,
            published_at: a.published_at,
            score: a.final_score
        }));

        return NextResponse.json({ articles: mappedArticles });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
