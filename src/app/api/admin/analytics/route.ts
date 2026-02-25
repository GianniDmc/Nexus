import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase-admin';
import { PUBLICATION_RULES } from '@/lib/publication-rules';

const supabase = getServiceSupabase();

export async function GET() {
    try {
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const seventyTwoHoursAgo = new Date(now.getTime() - 72 * 60 * 60 * 1000);
        const minScore = PUBLICATION_RULES.PUBLISH_THRESHOLD;

        // ────── Batch 1 : count-only queries (parallelisées) ──────
        const [
            totalArticlesRes,
            publishedRes,
            pendingRes,
            rejectedRes,
            last24hRes,
            lastWeekRes,
            clusterCountRes,
        ] = await Promise.all([
            supabase.from('articles').select('*', { count: 'exact', head: true }),
            supabase.from('clusters').select('*', { count: 'exact', head: true }).eq('is_published', true),
            supabase.from('clusters').select('*', { count: 'exact', head: true }).eq('is_published', false).gte('final_score', minScore),
            supabase.from('clusters').select('*', { count: 'exact', head: true }).lt('final_score', minScore).not('final_score', 'is', null),
            supabase.from('articles').select('*', { count: 'exact', head: true }).gte('created_at', oneDayAgo.toISOString()),
            supabase.from('articles').select('*', { count: 'exact', head: true }).gte('created_at', oneWeekAgo.toISOString()),
            supabase.from('clusters').select('*', { count: 'exact', head: true }),
        ]);

        // ────── Batch 2 : data queries (parallelisées) ──────
        const [
            categoryRes,
            scoreRes,
            sourceRes30d,
            clusterSizeRes,
            published30dRes,
            published72hRes,
            lastArticleRes,
        ] = await Promise.all([
            // Catégories : seulement les clusters publiés (pertinent éditorially)
            supabase.from('clusters').select('category').eq('is_published', true).not('category', 'is', null),
            // Scores : seulement les clusters des 30 derniers jours (pertinent)
            supabase.from('clusters').select('final_score').not('final_score', 'is', null).gte('created_at', thirtyDaysAgo.toISOString()),
            // Top Sources : 30 derniers jours (pas tout l'historique)
            supabase.from('articles').select('source_name').gte('created_at', thirtyDaysAgo.toISOString()),
            // Cluster sizes : count par cluster (30 derniers jours)
            supabase.from('articles').select('cluster_id').not('cluster_id', 'is', null).gte('created_at', thirtyDaysAgo.toISOString()),
            // Publications 30j
            supabase.from('clusters').select('published_on').eq('is_published', true).gte('published_on', thirtyDaysAgo.toISOString()),
            // Publications 72h
            supabase.from('clusters').select('published_on').eq('is_published', true).gte('published_on', seventyTwoHoursAgo.toISOString()),
            // Dernier article ingéré
            supabase.from('articles').select('created_at, source_name').order('created_at', { ascending: false }).limit(1).single(),
        ]);

        // ────── Post-traitement ──────
        const totalArticles = totalArticlesRes.count || 0;
        const publishedCount = publishedRes.count || 0;
        const pendingCount = pendingRes.count || 0;
        const rejectedCount = rejectedRes.count || 0;
        const last24h = last24hRes.count || 0;
        const lastWeek = lastWeekRes.count || 0;
        const clusterCount = clusterCountRes.count || 0;

        // Categories (clusters publiés)
        const categoryMap: Record<string, number> = {};
        categoryRes.data?.forEach((c) => {
            const cat = c.category || 'Non classé';
            categoryMap[cat] = (categoryMap[cat] || 0) + 1;
        });
        const categories = Object.entries(categoryMap)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);

        // Score Distribution (30j)
        const scoreBuckets = Array.from({ length: 11 }, (_, i) => ({ range: i.toString(), count: 0 }));
        scoreRes.data?.forEach((c) => {
            let score = Math.round(c.final_score || 0);
            if (score < 0) score = 0;
            if (score > 10) score = 10;
            scoreBuckets[score].count++;
        });

        // Top Sources (30j)
        const sourceMap: Record<string, number> = {};
        sourceRes30d.data?.forEach((a) => {
            const src = a.source_name || 'Inconnu';
            sourceMap[src] = (sourceMap[src] || 0) + 1;
        });
        const topSources = Object.entries(sourceMap)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        // Cluster sizes (30j)
        const clusterSizeMap: Record<string, number> = {};
        clusterSizeRes.data?.forEach((a) => {
            clusterSizeMap[a.cluster_id] = (clusterSizeMap[a.cluster_id] || 0) + 1;
        });
        const multiArticleClusters = Object.values(clusterSizeMap).filter((c) => c > 1).length;
        const avgClusterSize = Object.values(clusterSizeMap).length > 0
            ? (Object.values(clusterSizeMap).reduce((a, b) => a + b, 0) / Object.values(clusterSizeMap).length).toFixed(1)
            : 0;

        // Daily Activity (publications 30j)
        const dailyMap: Record<string, number> = {};
        published30dRes.data?.forEach(c => {
            if (!c.published_on) return;
            const dateKey = new Date(c.published_on).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
            dailyMap[dateKey] = (dailyMap[dateKey] || 0) + 1;
        });

        const dailyActivity: { date: string; count: number }[] = [];
        for (let i = 29; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            const key = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
            dailyActivity.push({ date: key, count: dailyMap[key] || 0 });
        }

        // Daily Ingestion (30j) avec split par source
        // Réutilise sourceRes30d pour éviter un 2e fetch
        const ingestionMap: Record<string, Record<string, number>> = {};
        const allSources = new Set<string>();

        sourceRes30d.data?.forEach(a => {
            // On n'a pas created_at dans cette query, on le déduit depuis les sources déjà chargées
            // => On a besoin d'un fetch séparé pour created_at. Utilisons un approach simplifiée :
            // ingestion totale par source (déjà calculée), pas de split jour par jour
        });

        // Fetch ingestion avec dates (paginé mais temps-limité)
        let allIngestionArticles: { created_at: string; source_name: string | null }[] = [];
        let offset = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
            const { data: batch, error: batchError } = await supabase
                .from('articles')
                .select('created_at, source_name')
                .gte('created_at', thirtyDaysAgo.toISOString())
                .order('created_at', { ascending: false })
                .range(offset, offset + pageSize - 1);

            if (batchError) {
                console.error('[Analytics] Pagination error:', batchError);
                break;
            }

            if (batch && batch.length > 0) {
                allIngestionArticles = allIngestionArticles.concat(batch);
                offset += pageSize;
                hasMore = batch.length === pageSize;
            } else {
                hasMore = false;
            }
        }

        allIngestionArticles.forEach(a => {
            if (!a.created_at) return;
            const dateKey = new Date(a.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
            const source = a.source_name || 'Inconnu';
            allSources.add(source);

            if (!ingestionMap[dateKey]) ingestionMap[dateKey] = { total: 0 };
            ingestionMap[dateKey].total = (ingestionMap[dateKey].total || 0) + 1;
            ingestionMap[dateKey][source] = (ingestionMap[dateKey][source] || 0) + 1;
        });

        const sourceCountsTotal: Record<string, number> = {};
        allIngestionArticles.forEach(a => {
            const source = a.source_name || 'Inconnu';
            sourceCountsTotal[source] = (sourceCountsTotal[source] || 0) + 1;
        });
        const allSourcesSorted = Object.entries(sourceCountsTotal)
            .sort((a, b) => b[1] - a[1])
            .map(([name]) => name);

        const dailyIngestion: { date: string; count: number;[source: string]: number | string }[] = [];
        for (let i = 29; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            const key = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
            const dayData = ingestionMap[key] || {};

            const entry: { date: string; count: number;[source: string]: number | string } = {
                date: key,
                count: dayData.total || 0,
            };

            allSourcesSorted.forEach(source => {
                entry[source] = dayData[source] || 0;
            });
            dailyIngestion.push(entry);
        }

        const ingestionSources = allSourcesSorted;

        // Hourly Activity (publications 72h)
        const hourlyMap: Record<string, number> = {};
        published72hRes.data?.forEach(c => {
            if (!c.published_on) return;
            const dateObj = new Date(c.published_on);
            const key = `${dateObj.getDate()}/${dateObj.getMonth() + 1} ${dateObj.getHours()}h`;
            hourlyMap[key] = (hourlyMap[key] || 0) + 1;
        });

        const hourlyActivity: { time: string; count: number }[] = [];
        for (let i = 71; i >= 0; i--) {
            const d = new Date(now.getTime() - i * 60 * 60 * 1000);
            const key = `${d.getDate()}/${d.getMonth() + 1} ${d.getHours()}h`;
            hourlyActivity.push({ time: key, count: hourlyMap[key] || 0 });
        }

        // Health
        const lastArticle = lastArticleRes.data;

        return NextResponse.json({
            content: {
                total: totalArticles,
                published: publishedCount,
                pending: pendingCount,
                rejected: rejectedCount,
                last24h,
                lastWeek,
            },
            categories,
            scoreDistribution: scoreBuckets,
            topSources,
            clusters: {
                total: clusterCount,
                multiArticle: multiArticleClusters,
                avgSize: avgClusterSize,
            },
            dailyActivity,
            dailyIngestion,
            ingestionSources,
            hourlyActivity,
            health: {
                lastIngestion: lastArticle?.created_at || null,
                lastSource: lastArticle?.source_name || null,
            },
        });
    } catch (error) {
        console.error('Analytics API Error:', error);
        return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
    }
}
