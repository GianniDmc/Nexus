
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Manually parse .env.local
try {
    const envPath = path.resolve(__dirname, '../.env.local');
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
        const [key, val] = line.split('=');
        if (key && val) process.env[key.trim()] = val.trim();
    });
} catch (e) {
    console.warn("Could not read .env.local, checking process.env");
}

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Error: Missing environment variables (SUPABASE_URL or SERVICE_ROLE_KEY)');
    process.exit(1);
}

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkCluster() {
    const searchTerm = 'Future sealed: TikTok';
    console.log(`Searching for cluster with label like: "${searchTerm}"...`);

    const { data: clusters, error } = await supabase
        .from('clusters')
        .select(`
      *,
      articles:articles!articles_cluster_id_fkey(count),
      summary:summaries!summaries_cluster_id_fkey(*)
    `)
        .ilike('label', `%${searchTerm}%`);

    if (error) {
        console.error('Error fetching cluster:', error);
        return;
    }

    if (!clusters || clusters.length === 0) {
        console.log('No cluster found.');
        return;
    }

    const c = clusters[0];
    const now = new Date();
    const created = new Date(c.created_at);
    const ageHours = (now - created) / (1000 * 60 * 60);

    console.log('\n--- CLUSTER REPORT ---');
    console.log(`ID: ${c.id}`);
    console.log(`Label: ${c.label}`);
    console.log(`Created: ${c.created_at} (${ageHours.toFixed(2)} hours ago)`);
    console.log(`Score: ${c.final_score}`);
    console.log(`Published: ${c.is_published}`);
    console.log(`Cluster Size (Sources): ${c.articles[0].count}`);
    console.log(`Has Summary: ${!!c.summary}`);
    if (c.summary) {
        console.log(`Summary Title: ${c.summary.title}`);
        console.log(`Summary Length: ${c.summary.content_full?.length || 0}`);
    }

    console.log('\n--- ANALYSIS ---');
    if (c.final_score < 8.0) console.log(`[BLOCK] Score ${c.final_score} < 8.0`);
    if (c.articles[0].count < 2) console.log(`[BLOCK] Sources ${c.articles[0].count} < 2 (assuming min=2)`);
    if (ageHours < 6) console.log(`[BLOCK] Age ${ageHours.toFixed(1)}h < 6h (Maturity)`);

}

checkCluster();
