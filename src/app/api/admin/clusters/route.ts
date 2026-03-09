
import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase-admin';
import { parseBoundedInt } from '@/lib/http';

export const dynamic = 'force-dynamic';

type RpcClusterRow = {
    id: string;
    label: string;
    is_published: boolean;
    final_score: number | null;
    created_at: string;
    article_count: number;
    total_count: number;
};

type ClusterScoreDetailsRow = {
    id: string;
    scoring_details: unknown | null;
};

export async function GET(req: NextRequest) {
    const supabase = getServiceSupabase();

    const { searchParams } = new URL(req.url);
    const page = parseBoundedInt(searchParams.get('page'), 1, 1, 100000);
    const limit = parseBoundedInt(searchParams.get('limit'), 20, 1, 200);
    const search = searchParams.get('search') || null;
    const status = searchParams.get('status') || 'all'; // 'all', 'published', 'unpublished', 'important'
    const sort = searchParams.get('sort') || 'date_desc'; // 'date_desc', 'score_desc', 'count_desc'

    const offset = (page - 1) * limit;

    try {
        const { data: rpcRows, error } = await supabase.rpc('search_clusters', {
            search_query: search,
            filter_status: status,
            sort_by: sort,
            limit_val: limit,
            offset_val: offset
        });

        if (error) throw error;

        const rows = (rpcRows || []) as RpcClusterRow[];

        let scoringDetailsMap = new Map<string, unknown | null>();
        if (rows.length > 0) {
            const clusterIds = rows.map((row) => row.id);
            const { data: detailRows, error: detailError } = await supabase
                .from('clusters')
                .select('id, scoring_details')
                .in('id', clusterIds);

            if (detailError) throw detailError;

            scoringDetailsMap = new Map(
                ((detailRows || []) as ClusterScoreDetailsRow[]).map((row) => [row.id, row.scoring_details])
            );
        }

        const clusters = rows.map((row) => ({
            ...row,
            scoring_details: scoringDetailsMap.get(row.id) ?? null
        }));

        // Extract total from the first row (window function result)
        // Note: usage of total_count in window function returns same total for all rows
        const total = rows.length > 0 ? rows[0].total_count : 0;

        return NextResponse.json({
            clusters,
            total: Number(total),
            page,
            totalPages: Math.ceil(Number(total) / limit)
        });

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("Cluster Search Error:", error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
