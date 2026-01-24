import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET() {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    try {
        // Try to use the SQL function first (more efficient)
        const { data: rpcData, error: rpcError } = await supabase.rpc('get_multi_article_clusters');

        if (!rpcError && rpcData) {
            return NextResponse.json({ clusters: rpcData });
        }

        // Fallback to JS-based approach if function doesn't exist
        console.warn('[CLUSTERS] SQL function not found, using fallback. Run the migration to enable.');

        const { data: articles, error: articlesError } = await supabase
            .from('articles')
            .select('cluster_id')
            .not('cluster_id', 'is', null)
            .range(0, 9999);

        if (articlesError) throw articlesError;

        const articleCounts: Record<string, number> = {};
        articles?.forEach(a => {
            if (a.cluster_id) {
                articleCounts[a.cluster_id] = (articleCounts[a.cluster_id] || 0) + 1;
            }
        });

        const multiClusterIds = Object.entries(articleCounts)
            .filter(([_, count]) => count > 1)
            .map(([id]) => id);

        if (multiClusterIds.length === 0) {
            return NextResponse.json({ clusters: [] });
        }

        const { data: clusters, error: clustersError } = await supabase
            .from('clusters')
            .select('id, label, is_published, final_score, created_at')
            .in('id', multiClusterIds)
            .order('created_at', { ascending: false });

        if (clustersError) throw clustersError;

        const enrichedClusters = (clusters || []).map(cluster => ({
            ...cluster,
            article_count: articleCounts[cluster.id] || 0
        }));

        enrichedClusters.sort((a, b) => b.article_count - a.article_count);

        return NextResponse.json({ clusters: enrichedClusters });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
