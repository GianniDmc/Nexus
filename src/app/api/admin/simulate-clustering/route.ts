
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Replicate the logic from src/app/api/process/route.ts
export async function POST(req: NextRequest) {
    // Robust Service Role Client
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false,
            }
        }
    );

    console.log('[DEBUG] API Start. Service Role Client initialized.');

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
        const { data: matches, error: rpcError } = await supabase.rpc('find_similar_articles', {
            query_embedding: article.embedding,
            match_threshold: 0.5,
            match_count: 20,
            anchor_date: article.published_at || new Date().toISOString(),
            window_days: 7,
            exclude_id: article.id
        });

        if (rpcError) throw rpcError;

        // 3. Analyze results

        let decision = "NEW_CLUSTER";
        let targetCluster = null;

        const matchesWithDetails: any[] = [];

        if (matches && matches.length > 0) {
            // Robustness: Fetch latest cluster_id for these articles directly from DB
            const matchIds = matches.map((m: any) => m.id);

            const { data: freshArticles } = await supabase
                .from('articles')
                .select('id, cluster_id')
                .in('id', matchIds);

            const articleClusterMap: Record<string, string> = {};
            freshArticles?.forEach((a: any) => {
                if (a.cluster_id) articleClusterMap[a.id] = a.cluster_id;
            });

            // Get Cluster details for matches using fresh id
            const clusterIds = Array.from(new Set(Object.values(articleClusterMap)));

            console.log(`[DEBUG] Matches found: ${matches.length}`);
            console.log(`[DEBUG] IDs with cluster: ${clusterIds.length}`, clusterIds);

            let clustersMap: Record<string, any> = {};
            let clusterError = null;

            if (clusterIds.length > 0) {
                // Fetch basic cluster info
                const { data: clusters, error: err } = await supabase
                    .from('clusters')
                    .select('id, label') // Removed article_count as it doesn't exist
                    .in('id', clusterIds);

                if (err) {
                    console.error('[DEBUG] Cluster fetch error:', err);
                    clusterError = err;
                } else {
                    console.log(`[DEBUG] Clusters found in DB: ${clusters?.length}`);

                    // Manually count articles for these clusters
                    const { data: counts } = await supabase
                        .from('articles')
                        .select('cluster_id')
                        .in('cluster_id', clusterIds);

                    const countMap: Record<string, number> = {};
                    counts?.forEach((c: any) => {
                        countMap[c.cluster_id] = (countMap[c.cluster_id] || 0) + 1;
                    });

                    clusters?.forEach(c => {
                        clustersMap[c.id] = {
                            ...c,
                            article_count: countMap[c.id] || 0
                        };
                    });
                }
            }

            // Strategy: The pipeline picks the *first* match that has a cluster AND is >= 0.75
            // Note: Our RPC now returns >= 0.5, so we must filter for the decision logic.
            const validMatches = matches.filter((m: any) => m.similarity >= 0.75);

            const bestMatchWithCluster = validMatches.find((m: any) => articleClusterMap[m.id]);

            matchesWithDetails.push(...matches.map((m: any) => {
                // Use fresh cluster ID
                const realClusterId = articleClusterMap[m.id] || m.cluster_id;
                return {
                    ...m,
                    cluster_id: realClusterId,
                    cluster: realClusterId ? clustersMap[realClusterId] : null,
                    matchType: m.similarity >= 0.75 ? 'valid' : 'weak'
                };
            }));

            if (bestMatchWithCluster) {
                const targetId = articleClusterMap[bestMatchWithCluster.id];
                decision = "JOIN_EXISTING";
                targetCluster = clustersMap[targetId];

                // Enhance: Fetch latest articles for this target cluster to display in UI
                if (targetCluster) {
                    const { data: clusterArticles } = await supabase
                        .from('articles')
                        .select('id, title, source_name, published_at')
                        .eq('cluster_id', targetCluster.id)
                        .order('published_at', { ascending: false })
                        .limit(50);

                    targetCluster = {
                        ...targetCluster,
                        previewArticles: clusterArticles || []
                    };
                }

            } else if (validMatches.length > 0) {
                // It matches other articles with high confidence, but they are not in a cluster yet.
                // This effectively creates a new cluster.
                decision = "CREATE_CLUSTER";
            } else {
                // No matches >= 0.75
                decision = "create_new_force"; // Or essentially just NEW_CLUSTER, effectively the same.
            }

            return NextResponse.json({
                article,
                matches: matchesWithDetails,
                decision,
                targetCluster,
                threshold: 0.75,
                windowDays: 7
            });
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
