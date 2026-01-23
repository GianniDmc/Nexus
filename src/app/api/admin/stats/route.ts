import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const { count: total } = await supabase.from('articles').select('*', { count: 'exact', head: true });

    // Articles pas encore scorés
    const { count: pendingScore } = await supabase.from('articles').select('*', { count: 'exact', head: true }).is('relevance_score', null);

    const { count: relevant } = await supabase.from('articles').select('*', { count: 'exact', head: true }).gte('final_score', 5.5);

    const { count: rejected } = await supabase.from('articles').select('*', { count: 'exact', head: true }).lt('final_score', 5.5).not('final_score', 'is', null);

    const { count: pendingSummary } = await supabase.from('articles').select('*', { count: 'exact', head: true }).gte('final_score', 5.5).is('summary_short', null);

    // Articles prêts (scorés + résumés) mais PAS encore publiés
    const { count: ready } = await supabase.from('articles').select('*', { count: 'exact', head: true }).gte('final_score', 5.5).not('summary_short', 'is', null).eq('is_published', false);

    const { count: published } = await supabase.from('articles').select('*', { count: 'exact', head: true }).eq('is_published', true);

    const { count: clusterCount } = await supabase.from('clusters').select('*', { count: 'exact', head: true });

    const { count: scored } = await supabase.from('articles').select('*', { count: 'exact', head: true }).not('relevance_score', 'is', null);

    const { data: lastArticle } = await supabase.from('articles').select('created_at').order('created_at', { ascending: false }).limit(1).single();

    return NextResponse.json({
      total,
      pendingScore,
      scored,
      relevant,
      rejected,
      pendingSummary,
      ready,
      published,
      clusterCount,
      lastSync: lastArticle?.created_at || null
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
