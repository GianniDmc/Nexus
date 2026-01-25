
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

async function debugQuery() {
    console.log('--- Debugging Queries ---');

    // Test A: Standard Join (Ambiguous?)
    console.log('\n[A] Standard JOIN: clusters!inner');
    const { count: countA, error: errorA } = await supabase
        .from('articles')
        .select('cluster_id, clusters!inner(final_score)', { count: 'exact', head: true })
        .is('clusters.final_score', null);
    console.log(`Result: ${countA}, Error: ${JSON.stringify(errorA)}`);

    // Test B: Explicit FK Join
    console.log('\n[B] Explicit FK JOIN: clusters!articles_cluster_id_fkey!inner');
    const { count: countB, error: errorB } = await supabase
        .from('articles')
        .select('cluster_id, clusters!articles_cluster_id_fkey!inner(final_score)', { count: 'exact', head: true })
        .is('clusters.final_score', null);
    console.log(`Result: ${countB}, Error: ${JSON.stringify(errorB)}`);

    // Test C: Filter syntax variation
    console.log('\n[C] Filter Syntax: .filter()');
    const { count: countC, error: errorC } = await supabase
        .from('articles')
        .select('cluster_id, clusters!inner(final_score)', { count: 'exact', head: true })
        .filter('clusters.final_score', 'is', null);
    console.log(`Result: ${countC}, Error: ${JSON.stringify(errorC)}`);

    // Test D: Simple Select to verify resource name visibility
    console.log('\n[D] Simple Select 1 item with join');
    const { data: dataD, error: errorD } = await supabase
        .from('articles')
        .select('cluster_id, clusters(id)')
        .limit(1);
    if (errorD) console.log('Error D:', errorD);
    else console.log('Data D:', dataD ? 'Found' : 'Null');
}

debugQuery().catch(console.error);
