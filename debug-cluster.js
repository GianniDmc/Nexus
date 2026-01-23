const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envPath = path.resolve(__dirname, '.env.local');
const envConfig = fs.readFileSync(envPath, 'utf8');

envConfig.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
        process.env[match[1]] = match[2].trim();
    }
});

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkClusters() {
    console.log("Checking clusters...");

    // 1. Get articles that HAVE a cluster_id
    const { data: articles, error } = await supabase
        .from('articles')
        .select('*')
        .not('cluster_id', 'is', null)
        .limit(5);

    if (error) {
        console.error("Error fetching articles:", error);
        return;
    }

    console.log(`Found ${articles.length} articles with cluster_id.`);

    for (const article of articles) {
        console.log(`\nChecking Article: "${article.title}" (ID: ${article.id})`);
        console.log(`Cluster ID: ${article.cluster_id}`);

        // 2. Query for that cluster ID
        const { data: clusterMembers, error: clusterError } = await supabase
            .from('articles')
            .select('id, title')
            .eq('cluster_id', article.cluster_id);

        if (clusterError) {
            console.error("Error querying cluster:", clusterError);
        } else {
            console.log(`> Found ${clusterMembers.length} members in this cluster.`);
            clusterMembers.forEach(m => console.log(`  - [${m.id}] ${m.title}`));
        }
    }
}

checkClusters();
