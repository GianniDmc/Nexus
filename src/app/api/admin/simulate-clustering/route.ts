
import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase-admin';

// Seuil de cohérence identique au pipeline (clustering-step.ts)
const CLUSTER_COHERENCE_THRESHOLD = 0.80;

type SimilarMatch = {
    id: string;
    similarity: number;
    cluster_id: string | null;
};

// Réplique de selectBestCluster de clustering-step.ts
function selectBestCluster(matchRows: SimilarMatch[]): { clusterId: string; bestSimilarity: number } | null {
    const clusterMap = new Map<string, { bestSimilarity: number; matchCount: number }>();

    for (const match of matchRows) {
        if (!match.cluster_id) continue;

        const entry = clusterMap.get(match.cluster_id);
        if (entry) {
            entry.bestSimilarity = Math.max(entry.bestSimilarity, match.similarity);
            entry.matchCount++;
        } else {
            clusterMap.set(match.cluster_id, { bestSimilarity: match.similarity, matchCount: 1 });
        }
    }

    let bestClusterId: string | null = null;
    let bestScore = -1;
    let bestCount = 0;

    for (const [clusterId, entry] of clusterMap) {
        if (entry.bestSimilarity < CLUSTER_COHERENCE_THRESHOLD) continue;
        if (
            entry.bestSimilarity > bestScore ||
            (entry.bestSimilarity === bestScore && entry.matchCount > bestCount)
        ) {
            bestClusterId = clusterId;
            bestScore = entry.bestSimilarity;
            bestCount = entry.matchCount;
        }
    }

    return bestClusterId ? { clusterId: bestClusterId, bestSimilarity: bestScore } : null;
}

// Replicate the logic from src/app/api/process/route.ts
export async function POST(req: NextRequest) {
    const supabase = getServiceSupabase();

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

        const matchesWithDetails: Record<string, unknown>[] = [];

        if (matches && matches.length > 0) {
            // Robustness: Fetch latest cluster_id for these articles directly from DB
            const matchIds = matches.map((m: SimilarMatch) => m.id);

            const { data: freshArticles } = await supabase
                .from('articles')
                .select('id, cluster_id')
                .in('id', matchIds);

            const articleClusterMap: Record<string, string> = {};
            freshArticles?.forEach((a: { id: string; cluster_id: string | null }) => {
                if (a.cluster_id) articleClusterMap[a.id] = a.cluster_id;
            });

            // Get Cluster details for matches using fresh id
            const clusterIds = Array.from(new Set(Object.values(articleClusterMap)));

            console.log(`[DEBUG] Matches found: ${matches.length}`);
            console.log(`[DEBUG] IDs with cluster: ${clusterIds.length}`, clusterIds);

            let clustersMap: Record<string, Record<string, unknown>> = {};

            if (clusterIds.length > 0) {
                // Fetch basic cluster info
                const { data: clusters, error: err } = await supabase
                    .from('clusters')
                    .select('id, label')
                    .in('id', clusterIds);

                if (err) {
                    console.error('[DEBUG] Cluster fetch error:', err);
                } else {
                    console.log(`[DEBUG] Clusters found in DB: ${clusters?.length}`);

                    // Manually count articles for these clusters
                    const { data: counts } = await supabase
                        .from('articles')
                        .select('cluster_id')
                        .in('cluster_id', clusterIds);

                    const countMap: Record<string, number> = {};
                    counts?.forEach((c: { cluster_id: string }) => {
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

            // Préparer les matches avec les cluster_ids frais pour selectBestCluster
            const enrichedMatches: SimilarMatch[] = matches.map((m: SimilarMatch) => ({
                ...m,
                cluster_id: articleClusterMap[m.id] || m.cluster_id || null,
            }));

            // Utiliser la même logique que le pipeline
            const bestCluster = selectBestCluster(enrichedMatches);

            matchesWithDetails.push(...matches.map((m: SimilarMatch) => {
                // Use fresh cluster ID
                const realClusterId = articleClusterMap[m.id] || m.cluster_id;
                return {
                    ...m,
                    cluster_id: realClusterId,
                    cluster: realClusterId ? clustersMap[realClusterId] : null,
                    matchType: m.similarity >= CLUSTER_COHERENCE_THRESHOLD
                        ? 'valid'
                        : m.similarity >= 0.75
                            ? 'weak'
                            : 'below'
                };
            }));

            if (bestCluster) {
                decision = "JOIN_EXISTING";
                targetCluster = clustersMap[bestCluster.clusterId] || null;

                // Enhance: Fetch latest articles for this target cluster to display in UI
                if (targetCluster) {
                    const { data: clusterArticles } = await supabase
                        .from('articles')
                        .select('id, title, source_name, published_at')
                        .eq('cluster_id', bestCluster.clusterId)
                        .order('published_at', { ascending: false })
                        .limit(50);

                    targetCluster = {
                        ...targetCluster,
                        previewArticles: clusterArticles || []
                    };
                }

            } else {
                // Aucun cluster ne dépasse le seuil de cohérence
                const hasWeakMatches = enrichedMatches.some(m => m.cluster_id && m.similarity >= 0.75);
                if (hasWeakMatches) {
                    decision = "CREATE_CLUSTER"; // Matches existent mais trop faibles pour rejoindre
                } else {
                    decision = "NEW_CLUSTER";
                }
            }

            return NextResponse.json({
                article,
                matches: matchesWithDetails,
                decision,
                targetCluster,
                threshold: CLUSTER_COHERENCE_THRESHOLD,
                searchThreshold: 0.75,
                windowDays: 7
            });
        }

        return NextResponse.json({
            article,
            matches: matchesWithDetails,
            decision,
            targetCluster,
            threshold: CLUSTER_COHERENCE_THRESHOLD,
            searchThreshold: 0.75,
            windowDays: 7
        });

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

