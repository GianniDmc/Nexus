const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

async function seed() {
    console.log('🌱 Starting DB Seed (Prod -> Local)...');

    // 1. Get LOCAL keys from CLI
    console.log('🔍 Detecting Local Supabase config...');
    let localUrl, localKey;
    try {
        const output = execSync('npx supabase status -o json', { encoding: 'utf-8' });
        // Find the start of the JSON object (ignoring potential CLI warnings)
        const jsonStart = output.indexOf('{');
        if (jsonStart === -1) throw new Error('No JSON found in output');
        const jsonStr = output.slice(jsonStart);

        const status = JSON.parse(jsonStr);
        localUrl = status.API_URL;
        localKey = status.SERVICE_ROLE_KEY;
    } catch (e) {
        console.error('❌ Could not get local status. Is Docker running? (npm run db:start)');
        process.exit(1);
    }

    // 2. Get PROD keys from .env.local (Regex parsing to ignore comments/mode)
    console.log('🔍 Reading Prod config from .env.local...');
    const envPath = path.join(__dirname, '../.env.local');
    const envContent = fs.readFileSync(envPath, 'utf-8');

    // Regex to find keys in the PROD block or standard definition
    // We prefer the ones that look like cloud URLs
    const prodUrlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(https:\/\/[^ \n]+)/);
    // Service role might be commented out in local mode, so we look for the pattern
    const prodKeyMatch = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(eyJ[^ \n]+)/);

    if (!prodUrlMatch || !prodKeyMatch) {
        console.error('❌ Could not find PROD keys in .env.local');
        process.exit(1);
    }

    const prodUrl = prodUrlMatch[1];
    const prodKey = prodKeyMatch[1];

    console.log(`   Source: ${prodUrl}`);
    console.log(`   Target: ${localUrl}`);

    // 3. Init Clients
    const prod = createClient(prodUrl, prodKey);
    const local = createClient(localUrl, localKey);

    // 4. Migrate Data
    // Order matters: Sources -> Clusters -> Articles -> AppState

    console.log('🧹 Cleaning local tables...');
    // Delete all rows by filtering on ID != dummy UUID
    const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
    await local.from('articles').delete().neq('id', ZERO_UUID);
    await local.from('clusters').delete().neq('id', ZERO_UUID);
    await local.from('sources').delete().neq('id', ZERO_UUID);
    await local.from('app_state').delete().neq('key', '_');

    // --- Sources ---
    console.log('📦 Fetching Sources...');
    const { data: sources, error: errSrc } = await prod.from('sources').select('*');
    if (errSrc) throw errSrc;
    if (sources.length > 0) {
        const { error } = await local.from('sources').upsert(sources);
        if (error) throw error;
        console.log(`   ✅ Synced ${sources.length} sources`);
    }

    // --- Clusters (Recent 50) ---
    console.log('📦 Fetching Recent Clusters...');
    const { data: clusters, error: errClust } = await prod.from('clusters')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
    if (errClust) throw errClust;

    if (clusters.length > 0) {
        // Step 1: Insert clusters WITHOUT representative_article_id to avoid FK error (Article doesn't exist yet)
        const clustersForInsert = clusters.map(c => ({ ...c, representative_article_id: null }));
        const { error } = await local.from('clusters').upsert(clustersForInsert);
        if (error) throw error;
        console.log(`   ✅ Synced ${clusters.length} recent clusters (Shell)`);
    }

    // --- Articles (Linked to fetched clusters) ---
    console.log('📦 Fetching Related Articles...');
    // We want articles that are in these clusters OR recent ones
    const clusterIds = clusters.map(c => c.id);

    const { data: articles, error: errArt } = await prod.from('articles')
        .select('*')
        .or(`cluster_id.in.(${clusterIds.length > 0 ? `"${clusterIds.join('","')}"` : '""'}),cluster_id.is.null`)
        .order('created_at', { ascending: false })
        .limit(200);

    if (errArt) throw errArt;

    if (articles.length > 0) {
        const { error } = await local.from('articles').upsert(articles);
        if (error) throw error;
        console.log(`   ✅ Synced ${articles.length} articles`);
    }

    // --- Clusters (Update Representative) ---
    if (clusters.length > 0) {
        console.log('🔗 Linking Representative Articles...');
        // Step 2: Restore the representative_article_id
        const clustersForUpdate = clusters.map(c => ({
            id: c.id,
            representative_article_id: c.representative_article_id
        }));
        // We iterate or bulk update properly
        const { error } = await local.from('clusters').upsert(clustersForUpdate);
        if (error) throw error;
        console.log(`   ✅ Linked representatives`);
    }

    // --- App State ---
    console.log('📦 Fetching App State...');
    const { data: appState } = await prod.from('app_state').select('*');
    if (appState && appState.length > 0) {
        await local.from('app_state').upsert(appState);
        console.log(`   ✅ Synced App State`);
    }

    console.log('🎉 Seeding Complete! Database is ready.');
}

seed().catch(e => {
    console.error(e);
    process.exit(1);
});
