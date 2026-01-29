
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

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
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Get article counts per source via RPC
        const { data: stats, error: statsError } = await supabase
            .rpc('get_source_stats');

        if (statsError) console.error("Error fetching article counts:", statsError);

        const counts: Record<string, number> = {};
        stats?.forEach((s: { source_name: string; article_count: number }) => {
            if (s.source_name) counts[s.source_name] = s.article_count;
        });

        const sourcesWithStats = sources.map((s: any) => ({
            ...s,
            articleCount: counts[s.name] || 0
        }));

        return NextResponse.json({ sources: sourcesWithStats });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const body = await req.json();
    const { name, url, category } = body;

    if (!name || !url || !category) {
        return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const { data, error } = await supabase
        .from('sources')
        .insert([{ name, url, category, is_active: true }])
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ source: data });
}

export async function PUT(req: NextRequest) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const body = await req.json();
    const { id, is_active } = body;

    if (!id) {
        return NextResponse.json({ error: 'Missing ID' }, { status: 400 });
    }

    const { data, error } = await supabase
        .from('sources')
        .update({ is_active })
        .eq('id', id)
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ source: data });
}

export async function DELETE(req: NextRequest) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
        return NextResponse.json({ error: 'Missing ID' }, { status: 400 });
    }

    const { error } = await supabase
        .from('sources')
        .delete()
        .eq('id', id);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}

