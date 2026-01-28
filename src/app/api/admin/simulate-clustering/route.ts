
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Replicate the logic from src/app/api/process/route.ts
export async function POST(req: NextRequest) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    try {
        const { articleId } = await req.json();

        if (!articleId) {
            return NextResponse.json({ error: 'Article ID required' }, { status: 400 });
        }

        // 1. Fetch the target article's embedding and details
        const { data: article, error } = await supabase
            .from('articles')
            .select('id, title, embedding, published_at, cluster_id, source_name')
            .eq('id', articleId)
            .single();

        if (error || !article) {
            return NextResponse.json({ error: 'Article not found' }, { status: 404 });
        }

        if (!article.embedding) {
            return NextResponse.json({ error: 'Article has no embedding yet' }, { status: 400 });
        }

        // 2. Run the exact same RPC call as the processing pipeline
        // Threshold 0.75, Window 7 days
        const { data: matches, error: rpcError } = await supabase.rpc('find_similar_articles', {
            query_embedding: article.embedding,
            match_threshold: 0.75,
            match_count: 20,
            anchor_date: article.published_at || new Date().toISOString(),
            window_days: 7,
            exclude_id: article.id
        });

        if (rpcError) throw rpcError;

        // 3. Analyze results
        // Matches are returned with similarity scores
        // We need to fetch cluster details for the matches if available

        let decision = "NEW_CLUSTER";
        let targetCluster = null;

        const matchesWithDetails = [];

        if (matches && matches.length > 0) {
            // Get Cluster details for matches
            const clusterIds = matches
                .map((m: any) => m.cluster_id)
                .filter((id: any) => id !== null);

            let clustersMap: Record<string, any> = {};
            if (clusterIds.length > 0) {
                const { data: clusters } = await supabase
                    .from('clusters')
                    .select('id, label, article_count')
                    .in('id', clusterIds);

                clusters?.forEach(c => {
                    clustersMap[c.id] = c;
                });
            }

            // Strategy: The pipeline picks the *first* match that has a cluster
            const bestMatchWithCluster = matches.find((m: any) => m.cluster_id);

            matchesWithDetails.push(...matches.map((m: any) => ({
                ...m,
                cluster: m.cluster_id ? clustersMap[m.cluster_id] : null
            })));

            if (bestMatchWithCluster) {
                decision = "JOIN_EXISTING";
                targetCluster = clustersMap[bestMatchWithCluster.cluster_id];
            } else {
                // It matches other articles, but none are in a cluster yet (or they are singletons? Logic implies new cluster or grouping with them)
                // Actually, if it matches an unclustered article, the original logic creates a NEW cluster. 
                // Wait, if it matches unclustered article B, logic says:
                // "matches?.find((m: any) => m.cluster_id)" -> checks only for existing cluster.
                // If no existing cluster, it does "insert into clusters...".
                // So effectively it starts a new cluster (and presumably the other article would join it later when it's re-processed, or maybe not? 
                // The current logic only updates the CURRENT article's cluster_id.

                // Correction: The logic creates a new cluster for the current article. 
                // The other matching article is NOT automatically pulled in unless it's processed again.
                // However, usually "find_similar_articles" returns articles.

                decision = "CREATE_CLUSTER";
            }
        }

        return NextResponse.json({
            article,
            matches: matchesWithDetails,
            decision,
            targetCluster,
            threshold: 0.75,
            windowDays: 7
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
