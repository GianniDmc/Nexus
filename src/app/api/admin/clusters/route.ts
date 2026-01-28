
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search') || null;
    const status = searchParams.get('status') || 'all'; // 'all', 'published', 'unpublished', 'important'
    const sort = searchParams.get('sort') || 'date_desc'; // 'date_desc', 'score_desc', 'count_desc'

    const offset = (page - 1) * limit;

    try {
        const { data: rows, error } = await supabase.rpc('search_clusters', {
            search_query: search,
            filter_status: status,
            sort_by: sort,
            limit_val: limit,
            offset_val: offset
        });

        if (error) throw error;

        // Extract total from the first row (window function result)
        // Note: usage of total_count in window function returns same total for all rows
        const total = rows && rows.length > 0 ? rows[0].total_count : 0;

        return NextResponse.json({
            clusters: rows || [],
            total: Number(total),
            page,
            totalPages: Math.ceil(Number(total) / limit)
        });

    } catch (error: any) {
        console.error("Cluster Search Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
