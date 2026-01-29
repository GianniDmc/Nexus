import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Cosine similarity between two vectors
function cosineSimilarity(a: number[], b: number[]): number {
    if (!a || !b || a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
}

export async function POST(req: NextRequest) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    try {
        const { articleId1, articleId2 } = await req.json();

        if (!articleId1 || !articleId2) {
            return NextResponse.json(
                { error: 'Two article IDs required' },
                { status: 400 }
            );
        }

        // Fetch both articles with embeddings
        const { data: articles, error } = await supabase
            .from('articles')
            .select('id, title, embedding')
            .in('id', [articleId1, articleId2]);

        if (error) throw error;
        if (!articles || articles.length < 2) {
            return NextResponse.json(
                { error: 'Articles not found' },
                { status: 404 }
            );
        }

        const article1 = articles.find((a) => a.id === articleId1);
        const article2 = articles.find((a) => a.id === articleId2);

        if (!article1?.embedding || !article2?.embedding) {
            return NextResponse.json(
                { error: 'One or both articles missing embeddings' },
                { status: 400 }
            );
        }

        // Parse embeddings if they are returned as strings by Supabase
        const parseEmbedding = (emb: any): number[] => {
            if (typeof emb === 'string') {
                try {
                    return JSON.parse(emb);
                } catch (e) {
                    console.error("Failed to parse embedding string", e);
                    return [];
                }
            }
            return Array.isArray(emb) ? emb : [];
        };

        const vec1 = parseEmbedding(article1.embedding);
        const vec2 = parseEmbedding(article2.embedding);

        if (vec1.length === 0 || vec2.length === 0) {
            return NextResponse.json(
                { error: 'Invalid embedding format in database' },
                { status: 500 }
            );
        }

        const similarity = cosineSimilarity(vec1, vec2);

        return NextResponse.json({
            articleId1,
            articleId2,
            title1: article1.title,
            title2: article2.title,
            similarity: Math.round(similarity * 1000) / 1000, // 3 decimal places
            wouldCluster: similarity >= 0.70
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// GET: List articles for dropdown (with optional search)
export async function GET(req: NextRequest) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search');
    const ids = searchParams.get('ids'); // Optional: fetch specific IDs

    try {
        let query = supabase
            .from('articles')
            .select('id, title, source_name, cluster_id, published_at')
            .not('embedding', 'is', null)
            .order('published_at', { ascending: false })
            .limit(search ? 50 : 20);

        if (search) {
            query = query.ilike('title', `%${search}%`);
        }

        if (ids) {
            const idList = ids.split(',');
            query = supabase
                .from('articles')
                .select('id, title, source_name, cluster_id, published_at')
                .in('id', idList);
        }

        const { data: articles, error } = await query;

        if (error) throw error;

        return NextResponse.json({ articles });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
