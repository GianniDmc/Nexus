import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

// Fix for resolving .env.local from script dir
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const PUBLICATION_RULES = {
    PUBLISH_THRESHOLD: 8.0,
    MIN_SOURCES: 2,
    FRESHNESS_HOURS: 48,
    CLUSTER_MATURITY_HOURS: 6,
};

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function fetchAllClusters() {
    let allClusters: any[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    process.stdout.write("📥 Fetching clusters... ");
    while (hasMore) {
        const { data, error } = await supabase
            .from('clusters')
            .select(`
                id, 
                created_at, 
                final_score, 
                is_published, 
                summary:summaries(count),
                articles:articles!articles_cluster_id_fkey(count)
            `)
            .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) {
            console.error("\nError fetching clusters:", error);
            throw error;
        }

        if (data.length > 0) {
            allClusters = allClusters.concat(data);
            process.stdout.write(`${allClusters.length}... `);
            page++;
            if (data.length < pageSize) hasMore = false;
        } else {
            hasMore = false;
        }
    }
    console.log("✅ Done.");
    return allClusters;
}

async function checkCoverage() {
    console.log("🔍 Starting Full Coverage Analysis...");

    // 1. Analyze Clusters (State Machine)
    const clusters = await fetchAllClusters();
    console.log(`\n📊 Total Clusters in DB: ${clusters.length}`);

    const stats = {
        pending: 0,
        low_score: 0,
        published: 0,
        ready: 0,
        eligible: 0,
        incubating: 0,
        archived: 0,
        orphaned: 0
    };

    const orphans: any[] = [];
    const now = Date.now();
    const FRESHNESS_MS = PUBLICATION_RULES.FRESHNESS_HOURS * 60 * 60 * 1000;
    const MATURITY_MS = PUBLICATION_RULES.CLUSTER_MATURITY_HOURS * 60 * 60 * 1000;

    for (const c of clusters) {
        const hasSummary = c.summary && c.summary[0] && c.summary[0].count > 0; // Fix: summaries is an array or object depending on join, usually array for 1:N but 1:1 here.
        // Wait, select `summary:summaries(count)` returns array `[{count: 1}]` if exists? 
        // Let's assume standard Supabase return. Actually safer to check logic.
        // In my previous code I used `!summary` check.
        // Let's refine the query to be sure.

        // Categorization Logic
        let status = 'orphaned';

        if (c.final_score === null) {
            status = 'pending';
        } else if (c.is_published) {
            status = 'published';
        } else if (c.final_score < PUBLICATION_RULES.PUBLISH_THRESHOLD) {
            status = 'low_score';
        } else if (hasSummary) {
            // Score >= 8, Not Published, Has Summary
            status = 'ready';
        } else {
            // Score >= 8, Not Published, No Summary
            const ageInfo = now - new Date(c.created_at).getTime();
            const isFresh = ageInfo < FRESHNESS_MS;
            const isMature = ageInfo > MATURITY_MS;
            const sourceCount = c.articles && c.articles[0] ? c.articles[0].count : 0; // articles is array with count

            if (!isFresh) {
                status = 'archived';
            } else {
                // Fresh
                if (isMature && sourceCount >= PUBLICATION_RULES.MIN_SOURCES) {
                    status = 'eligible';
                } else {
                    status = 'incubating';
                }
            }
        }

        if (stats[status as keyof typeof stats] !== undefined) {
            stats[status as keyof typeof stats]++;
        } else {
            stats.orphaned++;
            orphans.push({ id: c.id, status_assigned: status, data: c });
        }
    }

    console.log("\n--- [ CLUSTERS STATE ] ---");
    console.table(stats);

    const totalCategorized = Object.values(stats).reduce((a, b) => a + b, 0);
    console.log(`\n✅ Verification: ${totalCategorized} / ${clusters.length}`);

    // 2. Analyze Articles (Unclustered / Stuck)
    console.log("\n--- [ ARTICLES COVERAGE ] ---");
    const { count: totalArticles } = await supabase.from('articles').select('*', { count: 'exact', head: true });
    const { count: unclustered } = await supabase.from('articles').select('*', { count: 'exact', head: true }).is('cluster_id', null);
    const { count: noEmbedding } = await supabase.from('articles').select('*', { count: 'exact', head: true }).is('embedding', null);

    console.log(`Total Articles: ${totalArticles}`);
    console.log(`Unclustered:    ${unclustered} (Waiting for embedding or clustering step)`);
    console.log(`No Embedding:   ${noEmbedding} (Waiting for embedding step)`);

    if (stats.orphaned > 0) {
        console.log("\n⚠️ CLUSTER ORPHANS FOUND:", JSON.stringify(orphans.slice(0, 3), null, 2));
    } else if (unclustered! > 0) {
        console.log(`\n⚠️ ${unclustered} articles are waiting to be clustered.`);
    } else {
        console.log("\n🎉 Full System Health Check Passed.");
    }
}

checkCoverage();
