import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { rewriteArticle } from '@/lib/ai';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
    try {
        const { id } = await request.json(); // id is clusterId

        if (!id) {
            return NextResponse.json({ error: 'Cluster ID required' }, { status: 400 });
        }

        // 1. Fetch Cluster Articles
        const { data: articles, error: fetchError } = await supabase
            .from('articles')
            .select('id, title, content, source_name, final_score, image_url')
            .eq('cluster_id', id)
            .order('final_score', { ascending: false });

        if (fetchError || !articles || articles.length === 0) {
            return NextResponse.json({ error: 'Articles not found for this cluster' }, { status: 404 });
        }

        // 2. Trigger Rewrite
        const rewritten = await rewriteArticle(articles);

        if (!rewritten) {
            throw new Error("AI Rewrite failed");
        }

        // 3. Save to Summaries & Update Cluster
        const todayDate = new Date().toISOString().slice(0, 10);
        const topArticle = articles[0]; // Best article for image/metadata linkage

        // Upsert Summary
        const { error: summaryError } = await supabase.from('summaries').upsert({
            cluster_id: id,
            title: rewritten.title,
            content_tldr: rewritten.tldr,
            content_analysis: rewritten.impact,
            content_full: rewritten.content,
            image_url: topArticle.image_url,
            source_count: articles.length,
            model_name: 'admin-manual'
        }, { onConflict: 'cluster_id' });

        if (summaryError) throw summaryError;

        // Update Cluster Status
        const { error: clusterError } = await supabase.from('clusters').update({
            is_published: true, // Auto publish
            label: rewritten.title,
            image_url: topArticle.image_url,
            published_on: new Date().toISOString(),
            final_score: 9, // Force high score so it stays in "Relevant" lists
            last_processed_at: new Date().toISOString()
        }).eq('id', id);

        if (clusterError) throw clusterError;

        return NextResponse.json({ success: true, rewritten });

    } catch (error: any) {
        console.error("Rewrite API Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
