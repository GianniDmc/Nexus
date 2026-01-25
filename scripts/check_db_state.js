
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Read .env.local manually
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

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkState() {
    console.log('--- Checking DB State ---');

    // 1. Articles Count
    const { count: totalArticles } = await supabase.from('articles').select('*', { count: 'exact', head: true });
    console.log(`Total Articles: ${totalArticles}`);

    // 2. Pending Embedding
    const { count: pendingEmbedding } = await supabase.from('articles').select('*', { count: 'exact', head: true }).is('embedding', null);
    console.log(`Pending Embedding: ${pendingEmbedding}`);

    // 3. Pending Clustering (Embedded but no cluster_id)
    const { count: pendingClustering } = await supabase.from('articles').select('*', { count: 'exact', head: true }).not('embedding', 'is', null).is('cluster_id', null);
    console.log(`Pending Clustering: ${pendingClustering}`);

    // 4. Clustered (Has cluster_id)
    const { count: clustered } = await supabase.from('articles').select('*', { count: 'exact', head: true }).not('cluster_id', 'is', null);
    console.log(`Clustered Articles: ${clustered}`);

    // 5. Clusters Count
    const { count: totalClusters } = await supabase.from('clusters').select('*', { count: 'exact', head: true });
    console.log(`Total Clusters: ${totalClusters}`);

    // 6. Unscored Clusters
    const { count: unscoredClusters } = await supabase.from('clusters').select('*', { count: 'exact', head: true }).is('final_score', null);
    console.log(`Pending Scoring (Clusters): ${unscoredClusters}`);

    // 7. Scored Clusters
    const { count: scoredClusters } = await supabase.from('clusters').select('*', { count: 'exact', head: true }).not('final_score', 'is', null);
    console.log(`Scored Clusters: ${scoredClusters}`);

    // 8. Published Clusters
    const { count: publishedClusters } = await supabase.from('clusters').select('*', { count: 'exact', head: true }).eq('is_published', true);
    console.log(`Published Clusters: ${publishedClusters}`);

    // 9. Unscored Clusters Sample
    if (unscoredClusters > 0) {
        const { data: sample } = await supabase.from('clusters').select('id, created_at').is('final_score', null).limit(3);
        console.log('Unscored Clusters Sample:', sample);
    }
}

checkState().catch(console.error);
