import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const clusterId = searchParams.get('clusterId');

        if (!clusterId) {
            return NextResponse.json({ error: 'clusterId required' }, { status: 400 });
        }

        const { data: articles, error } = await supabase
            .from('articles')
            .select('id, title, source_name, source_url, published_at')
            .eq('cluster_id', clusterId)
            .order('published_at', { ascending: false });

        if (error) throw error;

        return NextResponse.json({ articles });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
