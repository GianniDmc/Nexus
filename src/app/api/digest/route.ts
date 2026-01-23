import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateDailyDigest } from '@/lib/ai';

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    // 1. Récupérer les articles avec résumé des dernières 24h
    const { data: articles, error } = await supabase
      .from('articles')
      .select('title, summary_short, cluster_id')
      .not('summary_short', 'is', null)
      .gt('published_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    if (error) throw error;
    if (!articles || articles.length === 0) {
      return NextResponse.json({ message: 'Pas assez de news pour un digest' });
    }

    // 2. Prendre un article par cluster (ou articles sans cluster) pour avoir de la diversité
    const uniqueNews = [];
    const seenClusters = new Set();
    for (const art of articles) {
      if (!art.cluster_id || !seenClusters.has(art.cluster_id)) {
        uniqueNews.push(art);
        if (art.cluster_id) seenClusters.add(art.cluster_id);
      }
    }

    // 3. Générer le digest
    const digestContent = await generateDailyDigest(uniqueNews.slice(0, 15));
    
    if (digestContent) {
      const { data: newDigest, error: insertError } = await supabase
        .from('digests')
        .insert({
          title: digestContent.title,
          content_json: digestContent
        })
        .select()
        .single();

      if (insertError) throw insertError;
      return NextResponse.json({ success: true, digest: newDigest });
    }

    return NextResponse.json({ success: false, error: 'Échec de la génération' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
