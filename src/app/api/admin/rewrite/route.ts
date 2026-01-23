import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { rewriteArticle } from '@/lib/ai';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
    try {
        const { id } = await request.json();

        if (!id) {
            return NextResponse.json({ error: 'ID required' }, { status: 400 });
        }

        // 1. Get the article to check its cluster_id
        const { data: article, error: fetchError } = await supabase
            .from('articles')
            .select('cluster_id, title, content, source_name')
            .eq('id', id)
            .single();

        if (fetchError || !article) {
            return NextResponse.json({ error: 'Article not found' }, { status: 404 });
        }

        let clusterId = article.cluster_id;
        let sources = [];

        if (clusterId) {
            // 2. Fetch all articles in the cluster to be used as sources
            const { data: clusterArticles } = await supabase
                .from('articles')
                .select('title, content, source_name')
                .eq('cluster_id', clusterId);

            sources = clusterArticles || [article];
        } else {
            // Treat single article as the source
            sources = [article];
        }

        // 3. Trigger Rewrite
        const rewritten = await rewriteArticle(sources);

        if (!rewritten) {
            throw new Error("AI Rewrite failed");
        }

        // 4. Update the article with the new content
        // We update the TARGET article ID provided in the request
        const todayDate = new Date().toISOString().slice(0, 10);

        await supabase.from('articles').update({
            title: rewritten.title,
            summary_short: JSON.stringify({
                tldr: rewritten.tldr,
                full: rewritten.content,
                analysis: rewritten.impact,
                isFullSynthesis: true,
                sourceCount: sources.length
            }),
            is_published: true, // Auto publish on manual rewrite? Yes, likely intended.
            published_on: todayDate,
            final_score: 8 // Force high score
        }).eq('id', id);

        return NextResponse.json({ success: true, rewritten });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
