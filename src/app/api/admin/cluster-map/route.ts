import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase-admin';
import { PCA } from 'ml-pca';

function cosineSimilarity(A: number[], B: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < A.length; i++) {
        dotProduct += A[i] * B[i];
        normA += A[i] * A[i];
        normB += B[i] * B[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function GET() {
    try {
        const supabase = getServiceSupabase();

        // 1. Fetch recent clusters (NO JOIN yet to avoid timeout on large tables)
        const { data: clusters, error: clusterError } = await supabase
            .from('clusters')
            .select('id, label, category, is_published, final_score, representative_article_id')
            .order('created_at', { ascending: false })
            .limit(150);

        if (clusterError) {
            console.error("Supabase Error (clusters):", clusterError);
            throw new Error(`Erreur récupération clusters: ${clusterError.message}`);
        }

        if (!clusters || clusters.length === 0) {
            return NextResponse.json({ nodes: [], links: [] });
        }

        // 2. Fetch embeddings only for those 150 representative articles
        const repIds = clusters.filter(c => c.representative_article_id).map(c => c.representative_article_id);

        let embeddingsMap: Record<string, number[]> = {};
        if (repIds.length > 0) {
            const { data: articles, error: articlesError } = await supabase
                .from('articles')
                .select('id, embedding')
                .in('id', repIds);

            if (!articlesError && articles) {
                articles.forEach(a => {
                    let emb: number[] | null = null;
                    if (a.embedding) {
                        try {
                            let rawEmb = a.embedding;
                            if (typeof rawEmb === 'string') rawEmb = JSON.parse(rawEmb);
                            if (Array.isArray(rawEmb)) emb = rawEmb.map(Number);
                        } catch (e) {
                            console.error(`Error parsing embedding map:`, e);
                        }
                    }
                    if (emb) embeddingsMap[a.id] = emb;
                });
            }
        }

        // 3. Fetch counts for these clusters
        const clusterIds = clusters.map(c => c.id);
        const { data: countsData, error: countError } = await supabase
            .from('articles')
            .select('cluster_id')
            .in('cluster_id', clusterIds);

        const countMap: Record<string, number> = {};
        if (!countError && countsData) {
            countsData.forEach((row: any) => {
                countMap[row.cluster_id] = (countMap[row.cluster_id] || 0) + 1;
            });
        }

        // 4. Merge data and filter invalid embeddings
        const validClusters = clusters
            .map(c => ({
                ...c,
                article_count: countMap[c.id] || 0,
                embedding: c.representative_article_id ? embeddingsMap[c.representative_article_id] : null
            }))
            .filter(c => c.embedding !== null && Array.isArray(c.embedding) && c.embedding.length > 0);

        if (validClusters.length === 0) {
            return NextResponse.json({ nodes: [], links: [] });
        }

        // Prepare embedding matrix for PCA
        const embeddingsMatrix = validClusters.map(c => c.embedding!);

        // 2. Compute PCA
        // Note: ml-pca requires at least a few samples to work (number of items > components)
        let coords: number[][] = [];
        if (embeddingsMatrix.length > 2) {
            const pca = new PCA(embeddingsMatrix);
            // Get 2 principal components
            const prediction = pca.predict(embeddingsMatrix, { nComponents: 2 });
            coords = prediction.to2DArray();
        } else {
            // Fallback if not enough points (very rare)
            coords = embeddingsMatrix.map(() => [Math.random(), Math.random()]);
        }

        // Normaliser les coordonnées entre 0 et 100 pour la 2D Map (Recharts)
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        coords.forEach(([x, y]) => {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        });

        const rangeX = maxX - minX || 1;
        const rangeY = maxY - minY || 1;

        const nodes = validClusters.map((c, idx) => {
            const [rawX, rawY] = coords[idx];
            return {
                id: c.id,
                label: c.label,
                category: c.category || 'Général',
                is_published: c.is_published,
                score: c.final_score,
                article_count: c.article_count,
                // Normalized coords for 2D chart
                normX: ((rawX - minX) / rangeX) * 100,
                normY: ((rawY - minY) / rangeY) * 100,
                // Optional raw coords for force graph if it wants initial positions
                vx: rawX,
                vy: rawY
            };
        });

        // 3. Compute Similarities for Force Graph Links
        const links = [];
        const SIMILARITY_THRESHOLD = 0.72; // Tweak this for visual density

        for (let i = 0; i < validClusters.length; i++) {
            for (let j = i + 1; j < validClusters.length; j++) {
                const sim = cosineSimilarity(validClusters[i].embedding!, validClusters[j].embedding!);
                if (sim >= SIMILARITY_THRESHOLD) {
                    links.push({
                        source: validClusters[i].id,
                        target: validClusters[j].id,
                        similarity: sim
                    });
                }
            }
        }

        // We don't need to send the massive 768d embeddings to the client
        return NextResponse.json({ nodes, links });

    } catch (error: any) {
        console.error("Cluster Map API Error:", error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
