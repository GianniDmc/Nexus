const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Read .env.local to get credentials
const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
        envVars[key.trim()] = value.trim();
    }
});

const supabaseUrl = envVars['NEXT_PUBLIC_SUPABASE_URL'];
const supabaseKey = envVars['SUPABASE_SERVICE_ROLE_KEY'] || envVars['NEXT_PUBLIC_SUPABASE_ANON_KEY'];

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function extractArticles() {
    const { data: articles, error } = await supabase
        .from('articles')
        .select('title, published_at')
        .order('published_at', { ascending: false });

    if (error) {
        console.error('Error fetching articles:', error);
        return;
    }

    console.log(`Found ${articles.length} articles (Total in DB):`);
    console.log('---');
    articles.forEach(a => console.log(`- ${a.title}`));
    console.log('---');
}

extractArticles();
