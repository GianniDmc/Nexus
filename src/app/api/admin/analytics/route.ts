import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
    try {
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        // 1. Content Metrics
        const { count: totalArticles } = await supabase
            .from('articles')
            .select('*', { count: 'exact', head: true });

        const { count: publishedCount } = await supabase
            .from('articles')
            .select('*', { count: 'exact', head: true })
            .eq('is_published', true);

        const { count: pendingCount } = await supabase
            .from('articles')
            .select('*', { count: 'exact', head: true })
            .eq('is_published', false)
            .gt('final_score', 5);

        const { count: rejectedCount } = await supabase
            .from('articles')
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

        // 2. Category Distribution
        const { data: categoryData } = await supabase
            .from('articles')
            .select('category')
            .eq('is_published', true);

        const categoryMap: Record<string, number> = {};
        categoryData?.forEach((a) => {
            const cat = a.category || 'Non classé';
            categoryMap[cat] = (categoryMap[cat] || 0) + 1;
        });
        const categories = Object.entries(categoryMap)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);

        // 3. Score Distribution (histogram buckets)
        const { data: scoreData } = await supabase
            .from('articles')
            .select('final_score')
            .not('final_score', 'is', null);

        const scoreBuckets = [
            { range: '0-2', count: 0 },
            { range: '3-4', count: 0 },
            { range: '5-6', count: 0 },
            { range: '7-8', count: 0 },
            { range: '9-10', count: 0 },
        ];
        scoreData?.forEach((a) => {
            const score = a.final_score || 0;
            if (score <= 2) scoreBuckets[0].count++;
            else if (score <= 4) scoreBuckets[1].count++;
            else if (score <= 6) scoreBuckets[2].count++;
            else if (score <= 8) scoreBuckets[3].count++;
            else scoreBuckets[4].count++;
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

        // 6. Recent Activity (articles per day for last 7 days)
        const dailyActivity: { date: string; count: number }[] = [];
        for (let i = 6; i >= 0; i--) {
            const dayStart = new Date(now);
            dayStart.setDate(dayStart.getDate() - i);
            dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(dayStart);
            dayEnd.setHours(23, 59, 59, 999);

            const { count } = await supabase
                .from('articles')
                .select('*', { count: 'exact', head: true })
                .gte('created_at', dayStart.toISOString())
                .lte('created_at', dayEnd.toISOString());

            dailyActivity.push({
                date: dayStart.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }),
                count: count || 0,
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
