import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase-admin';

const supabase = getServiceSupabase();

export async function GET() {
    try {
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        // 1. Content Metrics
        const { count: totalArticles } = await supabase
            .from('articles')
            .select('*', { count: 'exact', head: true });

        // Published -> Clusters that are published
        const { count: publishedCount } = await supabase
            .from('clusters')
            .select('*', { count: 'exact', head: true })
            .eq('is_published', true);

        // Pending -> Clusters scored > 5, not published
        const { count: pendingCount } = await supabase
            .from('clusters')
            .select('*', { count: 'exact', head: true })
            .eq('is_published', false)
            .gt('final_score', 5);

        // Rejected -> Clusters scored <= 5
        const { count: rejectedCount } = await supabase
            .from('clusters')
            .select('*', { count: 'exact', head: true })
            .lte('final_score', 5)
            .not('final_score', 'is', null);

        const { count: last24h } = await supabase
            .from('articles')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', oneDayAgo.toISOString());

        const { count: lastWeek } = await supabase
            .from('articles')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', oneWeekAgo.toISOString());

        // 2. Category Distribution (from Clusters)
        const { data: categoryData } = await supabase
            .from('clusters')
            .select('category')
            .not('category', 'is', null);

        const categoryMap: Record<string, number> = {};
        categoryData?.forEach((c) => {
            const cat = c.category || 'Non classé';
            categoryMap[cat] = (categoryMap[cat] || 0) + 1;
        });
        const categories = Object.entries(categoryMap)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);

        // 3. Score Distribution (histogram buckets) - FROM CLUSTERS
        const { data: scoreData } = await supabase
            .from('clusters')
            .select('final_score')
            .not('final_score', 'is', null);

        // Initialize 0-10 buckets
        const scoreBuckets = Array.from({ length: 11 }, (_, i) => ({ range: i.toString(), count: 0 }));

        scoreData?.forEach((c) => {
            let score = Math.round(c.final_score || 0);
            if (score < 0) score = 0;
            if (score > 10) score = 10;
            scoreBuckets[score].count++;
        });

        // 4. Top Sources
        const { data: sourceData } = await supabase
            .from('articles')
            .select('source_name');

        const sourceMap: Record<string, number> = {};
        sourceData?.forEach((a) => {
            const src = a.source_name || 'Inconnu';
            sourceMap[src] = (sourceMap[src] || 0) + 1;
        });
        const topSources = Object.entries(sourceMap)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        // 5. Cluster Stats
        const { count: clusterCount } = await supabase
            .from('clusters')
            .select('*', { count: 'exact', head: true });

        const { data: clusterSizes } = await supabase
            .from('articles')
            .select('cluster_id')
            .not('cluster_id', 'is', null);

        const clusterSizeMap: Record<string, number> = {};
        clusterSizes?.forEach((a) => {
            clusterSizeMap[a.cluster_id] = (clusterSizeMap[a.cluster_id] || 0) + 1;
        });
        const multiArticleClusters = Object.values(clusterSizeMap).filter((c) => c > 1).length;
        const avgClusterSize = Object.values(clusterSizeMap).length > 0
            ? (Object.values(clusterSizeMap).reduce((a, b) => a + b, 0) / Object.values(clusterSizeMap).length).toFixed(1)
            : 0;

        // 6. Recent Activity (30 days daily) - PUBLICATIONS (Clusters)
        const dailyActivity: { date: string; count: number }[] = [];
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const { data: last30dClusters } = await supabase
            .from('clusters')
            .select('published_on')
            .eq('is_published', true)
            .gte('published_on', thirtyDaysAgo.toISOString());

        const dailyMap: Record<string, number> = {};
        last30dClusters?.forEach(c => {
            if (!c.published_on) return;
            const dateKey = new Date(c.published_on).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
            dailyMap[dateKey] = (dailyMap[dateKey] || 0) + 1;
        });

        for (let i = 29; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            const key = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
            dailyActivity.push({
                date: key,
                count: dailyMap[key] || 0
            });
        }

        // 6b. Daily Ingestion (30 days) - ARTICLES INGÉRÉS avec split par source
        const dailyIngestion: { date: string; count: number;[source: string]: number | string }[] = [];

        // Pagination pour contourner la limite de 1000 lignes Supabase
        let allArticles: { created_at: string; source_name: string | null }[] = [];
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
                allArticles = allArticles.concat(batch);
                offset += pageSize;
                hasMore = batch.length === pageSize;
            } else {
                hasMore = false;
            }
        }

        // Map: date -> { total, source1: count, source2: count, ... }
        const ingestionMap: Record<string, Record<string, number>> = {};
        const allSources = new Set<string>();

        allArticles.forEach(a => {
            if (!a.created_at) return;
            const dateKey = new Date(a.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
            const source = a.source_name || 'Inconnu';
            allSources.add(source);

            if (!ingestionMap[dateKey]) ingestionMap[dateKey] = { total: 0 };
            ingestionMap[dateKey].total = (ingestionMap[dateKey].total || 0) + 1;
            ingestionMap[dateKey][source] = (ingestionMap[dateKey][source] || 0) + 1;
        });

        // Toutes les sources triées par volume (pour le graphique stacked)
        const sourceCountsTotal: Record<string, number> = {};
        allArticles.forEach(a => {
            const source = a.source_name || 'Inconnu';
            sourceCountsTotal[source] = (sourceCountsTotal[source] || 0) + 1;
        });
        const allSourcesSorted = Object.entries(sourceCountsTotal)
            .sort((a, b) => b[1] - a[1])
            .map(([name]) => name);

        for (let i = 29; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            const key = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
            const dayData = ingestionMap[key] || {};

            const entry: { date: string; count: number;[source: string]: number | string } = {
                date: key,
                count: dayData.total || 0,
            };

            // Ajouter toutes les sources
            allSourcesSorted.forEach(source => {
                entry[source] = dayData[source] || 0;
            });

            dailyIngestion.push(entry);
        }

        // Liste de toutes les sources pour le graphique (triées par volume)
        const ingestionSources = allSourcesSorted;

        // 7. Hourly Activity (72h) - PUBLICATIONS (Clusters)
        const hourlyActivity: { time: string; count: number }[] = [];
        const seventyTwoHoursAgo = new Date(now.getTime() - 72 * 60 * 60 * 1000);

        const { data: last72hClusters } = await supabase
            .from('clusters')
            .select('published_on')
            .eq('is_published', true)
            .gte('published_on', seventyTwoHoursAgo.toISOString());

        const hourlyMap: Record<string, number> = {};
        last72hClusters?.forEach(c => {
            if (!c.published_on) return;
            const dateObj = new Date(c.published_on);
            const key = `${dateObj.getDate()}/${dateObj.getMonth() + 1} ${dateObj.getHours()}h`;
            hourlyMap[key] = (hourlyMap[key] || 0) + 1;
        });

        for (let i = 71; i >= 0; i--) {
            const d = new Date(now.getTime() - i * 60 * 60 * 1000);
            const key = `${d.getDate()}/${d.getMonth() + 1} ${d.getHours()}h`;
            hourlyActivity.push({
                time: key,
                count: hourlyMap[key] || 0
            });
        }

        // 7. Health Check - Last ingestion
        const { data: lastArticle } = await supabase
            .from('articles')
            .select('created_at, source_name')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        return NextResponse.json({
            content: {
                total: totalArticles || 0,
                published: publishedCount || 0,
                pending: pendingCount || 0,
                rejected: rejectedCount || 0,
                last24h: last24h || 0,
                lastWeek: lastWeek || 0,
            },
            categories,
            scoreDistribution: scoreBuckets,
            topSources,
            clusters: {
                total: clusterCount || 0,
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
