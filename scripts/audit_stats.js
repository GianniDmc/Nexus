
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        if (value.startsWith('"') && value.endsWith('"')) {
            value = value.slice(1, -1);
        }
        envVars[key] = value;
    }
});

const supabaseUrl = envVars['NEXT_PUBLIC_SUPABASE_URL'];
const supabaseKey = envVars['SUPABASE_SERVICE_ROLE_KEY'];
const supabase = createClient(supabaseUrl, supabaseKey);

async function auditStats() {
    console.log('=== AUDIT COMPLET DES STATISTIQUES ===\n');

    // 1. ARTICLES
    console.log('--- ARTICLES ---');
    const { count: total } = await supabase.from('articles').select('*', { count: 'exact', head: true });
    console.log(`Total Articles: ${total}`);

    const { count: pendingEmbedding } = await supabase.from('articles').select('*', { count: 'exact', head: true }).is('embedding', null);
    console.log(`Pending Embedding: ${pendingEmbedding}`);

    const { count: embedded } = await supabase.from('articles').select('*', { count: 'exact', head: true }).not('embedding', 'is', null);
    console.log(`Embedded: ${embedded}`);

    const { count: pendingClustering } = await supabase.from('articles').select('*', { count: 'exact', head: true }).not('embedding', 'is', null).is('cluster_id', null);
    console.log(`Pending Clustering (Embedded, No Cluster): ${pendingClustering}`);

    const { count: clustered } = await supabase.from('articles').select('*', { count: 'exact', head: true }).not('cluster_id', 'is', null);
    console.log(`Clustered: ${clustered}`);

    // 2. CLUSTERS
    console.log('\n--- CLUSTERS ---');
    const { count: totalClusters } = await supabase.from('clusters').select('*', { count: 'exact', head: true });
    console.log(`Total Clusters: ${totalClusters}`);

    const { count: unscoredClusters } = await supabase.from('clusters').select('*', { count: 'exact', head: true }).is('final_score', null);
    console.log(`Pending Scoring (Unscored): ${unscoredClusters}`);

    const { count: scoredClusters } = await supabase.from('clusters').select('*', { count: 'exact', head: true }).not('final_score', 'is', null);
    console.log(`Scored: ${scoredClusters}`);

    const { count: relevantClusters } = await supabase.from('clusters').select('*', { count: 'exact', head: true }).gte('final_score', 5);
    console.log(`Relevant (Score >= 5): ${relevantClusters}`);

    const { count: rejectedClusters } = await supabase.from('clusters').select('*', { count: 'exact', head: true }).lt('final_score', 5).not('final_score', 'is', null);
    console.log(`Rejected (Score < 5): ${rejectedClusters}`);

    const { count: publishedClusters } = await supabase.from('clusters').select('*', { count: 'exact', head: true }).eq('is_published', true);
    console.log(`Published: ${publishedClusters}`);

    const { count: actionableClusters } = await supabase.from('clusters').select('*', { count: 'exact', head: true }).gte('final_score', 5).eq('is_published', false);
    console.log(`Actionable (Relevant & Not Published): ${actionableClusters}`);

    // 3. MULTI-ARTICLE CLUSTERS (The missing one!)
    console.log('\n--- MULTI-ARTICLE CLUSTERS ---');
    // Method: Count articles per cluster, then count clusters with > 1 article
    const { data: clusterSizes } = await supabase
        .from('articles')
        .select('cluster_id')
        .not('cluster_id', 'is', null);

    const clusterMap = {};
    clusterSizes?.forEach(a => {
        clusterMap[a.cluster_id] = (clusterMap[a.cluster_id] || 0) + 1;
    });
    const multiArticleClusters = Object.values(clusterMap).filter(count => count > 1).length;
    console.log(`Multi-Article Clusters (>1 article): ${multiArticleClusters}`);

    // 4. JOINED QUERIES (Pending Scoring/Actionable ARTICLES)
    console.log('\n--- JOINED QUERIES (ARTICLES IN UNSCORED/ACTIONABLE CLUSTERS) ---');
    const { count: pendingScoringArticles } = await supabase
        .from('articles')
        .select('cluster_id, clusters!articles_cluster_id_fkey!inner(final_score)', { count: 'exact', head: true })
        .is('clusters.final_score', null);
    console.log(`Pending Scoring Articles: ${pendingScoringArticles}`);

    const { count: pendingActionableArticles } = await supabase
        .from('articles')
        .select('cluster_id, clusters!articles_cluster_id_fkey!inner(final_score, is_published)', { count: 'exact', head: true })
        .gte('clusters.final_score', 5)
        .eq('clusters.is_published', false);
    console.log(`Actionable Articles: ${pendingActionableArticles}`);

    console.log('\n=== FIN DE L\'AUDIT ===');
}

auditStats().catch(console.error);
