import { existsSync } from 'fs';
import { config } from 'dotenv';

// Only load .env.local if it exists (local dev). In CI, env vars are injected directly.
if (existsSync('.env.local')) {
    config({ path: '.env.local' });
}

import { createClient } from '@supabase/supabase-js';

interface DailyStats {
    period: string;
    articlesIngested: number;
    articlesWithEmbedding: number;
    articlesClustered: number;
    clustersCreated: number;
    clustersPublished: number;
    topSources: { name: string; count: number }[];
    topCategories: { name: string; count: number }[];
    errors: string[];
}

async function generateDailyReport(): Promise<DailyStats> {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const cutoff = yesterday.toISOString();

    const errors: string[] = [];

    // Articles ingested in last 24h
    const { count: articlesIngested, error: e1 } = await supabase
        .from('articles')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', cutoff);
    if (e1) errors.push(`Articles count: ${e1.message}`);

    // Articles with embedding in last 24h
    const { count: articlesWithEmbedding, error: e2 } = await supabase
        .from('articles')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', cutoff)
        .not('embedding', 'is', null);
    if (e2) errors.push(`Embeddings count: ${e2.message}`);

    // Articles clustered in last 24h
    const { count: articlesClustered, error: e3 } = await supabase
        .from('articles')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', cutoff)
        .not('cluster_id', 'is', null);
    if (e3) errors.push(`Clustered count: ${e3.message}`);

    // Clusters created in last 24h
    const { count: clustersCreated, error: e4 } = await supabase
        .from('clusters')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', cutoff);
    if (e4) errors.push(`Clusters created: ${e4.message}`);

    // Clusters published in last 24h
    const { count: clustersPublished, error: e5 } = await supabase
        .from('clusters')
        .select('*', { count: 'exact', head: true })
        .gte('published_on', cutoff);
    if (e5) errors.push(`Clusters published: ${e5.message}`);

    // Top sources (last 24h)
    const { data: recentArticles, error: e6 } = await supabase
        .from('articles')
        .select('source_name')
        .gte('created_at', cutoff);
    if (e6) errors.push(`Top sources: ${e6.message}`);

    const sourceCounts: Record<string, number> = {};
    recentArticles?.forEach(a => {
        sourceCounts[a.source_name] = (sourceCounts[a.source_name] || 0) + 1;
    });
    const topSources = Object.entries(sourceCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));

    // Top categories (from published clusters)
    const { data: recentClusters, error: e7 } = await supabase
        .from('clusters')
        .select('category')
        .gte('published_on', cutoff);
    if (e7) errors.push(`Top categories: ${e7.message}`);

    const categoryCounts: Record<string, number> = {};
    recentClusters?.forEach(c => {
        if (c.category) {
            categoryCounts[c.category] = (categoryCounts[c.category] || 0) + 1;
        }
    });
    const topCategories = Object.entries(categoryCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));

    return {
        period: `${yesterday.toLocaleDateString('fr-FR')} - ${now.toLocaleDateString('fr-FR')}`,
        articlesIngested: articlesIngested || 0,
        articlesWithEmbedding: articlesWithEmbedding || 0,
        articlesClustered: articlesClustered || 0,
        clustersCreated: clustersCreated || 0,
        clustersPublished: clustersPublished || 0,
        topSources,
        topCategories,
        errors
    };
}

function formatReport(stats: DailyStats): string {
    const lines = [
        `📊 NEXUS DAILY REPORT`,
        `Période: ${stats.period}`,
        ``,
        `📥 INGESTION`,
        `  • Articles ingérés: ${stats.articlesIngested}`,
        `  • Avec embedding: ${stats.articlesWithEmbedding}`,
        `  • Clusterisés: ${stats.articlesClustered}`,
        ``,
        `📰 PUBLICATION`,
        `  • Clusters créés: ${stats.clustersCreated}`,
        `  • Clusters publiés: ${stats.clustersPublished}`,
        ``
    ];

    if (stats.topSources.length > 0) {
        lines.push(`🏆 TOP SOURCES`);
        stats.topSources.forEach((s, i) => {
            lines.push(`  ${i + 1}. ${s.name}: ${s.count} articles`);
        });
        lines.push(``);
    }

    if (stats.topCategories.length > 0) {
        lines.push(`📂 TOP CATÉGORIES`);
        stats.topCategories.forEach((c, i) => {
            lines.push(`  ${i + 1}. ${c.name}: ${c.count} clusters`);
        });
        lines.push(``);
    }

    if (stats.errors.length > 0) {
        lines.push(`⚠️ ERREURS`);
        stats.errors.forEach(e => lines.push(`  • ${e}`));
    }

    return lines.join('\n');
}

async function main() {
    try {
        const stats = await generateDailyReport();
        const report = formatReport(stats);

        // Output for GitHub Actions
        console.log(report);

        // Also output JSON for potential parsing
        console.log('\n--- JSON ---');
        console.log(JSON.stringify(stats, null, 2));

        // Write to file for email action
        const fs = await import('fs');
        fs.writeFileSync('daily-report.txt', report);
        fs.writeFileSync('daily-report.json', JSON.stringify(stats));

    } catch (error) {
        console.error('[DAILY REPORT] Error:', error);
        process.exitCode = 1;
    }
}

main();
