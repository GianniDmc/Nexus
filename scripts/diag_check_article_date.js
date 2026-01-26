
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
    console.error('Error: Missing environment variables');
    process.exit(1);
}

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkArticle() {
    console.log(`Checking article "Optimus et Robotaxis"...`);

    // Fetch article with all columns to see what date fields exist
    const { data: articles, error } = await supabase
        .from('articles')
        .select('*')
        .ilike('title', '%Optimus et Robotaxis%')
        .limit(1);

    if (error) {
        console.error('Error fetching article:', error);
        return;
    }

    if (!articles || articles.length === 0) {
        console.log('No article found.');
        return;
    }

    const a = articles[0];
    console.log('\n--- ARTICLE REPORT ---');
    console.log(`ID: ${a.id}`);
    console.log(`Title: ${a.title}`);
    console.log(`pub_date: ${a.pub_date}`);
    console.log(`published_at: ${a.published_at}`);
    console.log(`created_at: ${a.created_at}`);
    console.log(`updated_at: ${a.updated_at}`);
    console.log('----------------------');
    console.log('Keys available:', Object.keys(a).filter(k => k.includes('date') || k.includes('at') || k.includes('pub')));
}

checkArticle();
