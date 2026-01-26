require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log('Fetching source articles...');

    // Fetch all articles that are in a cluster and have a category
    // We'll use these to determine the cluster's category
    const { data: articles, error } = await supabase
        .from('articles')
        .select('cluster_id, category')
        .not('cluster_id', 'is', null)
        .not('category', 'is', null);

    if (error) {
        console.error('Error fetching articles:', error);
        return;
    }

    // Map cluster_id -> category (first one wins)
    const clusterCategories = {};
    articles.forEach(a => {
        if (!clusterCategories[a.cluster_id]) {
            clusterCategories[a.cluster_id] = a.category;
        }
    });

    const clusterIds = Object.keys(clusterCategories);
    console.log(`Found ${clusterIds.length} clusters to update.`);

    let updatedCount = 0;

    // Update in batches of 50 to be nice to the DB
    const batchSize = 50;
    for (let i = 0; i < clusterIds.length; i += batchSize) {
        const batch = clusterIds.slice(i, i + batchSize);

        // We can't easily do a bulk update with different values without an RPC or upsert.
        // Given the scale (~1000), a loop of Promise.all for the batch is acceptable.

        const promises = batch.map(clusterId => {
            const category = clusterCategories[clusterId];
            return supabase
                .from('clusters')
                .update({ category })
                .eq('id', clusterId)
                .is('category', null); // Only update if null, to be safe
        });

        await Promise.all(promises);
        updatedCount += batch.length;
        process.stdout.write(`\rUpdated ${updatedCount}/${clusterIds.length} clusters...`);
    }

    console.log('\nBackfill complete.');
}

main();
