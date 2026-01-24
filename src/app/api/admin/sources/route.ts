import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET() {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    try {
        // Get all sources
        const { data: sources, error } = await supabase
            .from('sources')
            .select('*')
            .order('name', { ascending: true });

        if (error) throw error;

        // Get article counts per source
        const { data: articleCounts } = await supabase
            .from('articles')
            .select('source_name');

        const counts: Record<string, number> = {};
        articleCounts?.forEach(a => {
            if (a.source_name) counts[a.source_name] = (counts[a.source_name] || 0) + 1;
        });

        // Combine sources with counts
        const sourcesWithStats = sources.map(s => ({
            id: s.id,
            name: s.name,
            url: s.url,
            category: s.category,
            isActive: s.is_active,
            lastFetchedAt: s.last_fetched_at,
            articleCount: counts[s.name] || 0
        }));

        return NextResponse.json({ sources: sourcesWithStats });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
