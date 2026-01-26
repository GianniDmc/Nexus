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
    const { count, error } = await supabase
        .from('clusters')
        .select('*', { count: 'exact', head: true })
        .is('category', null);

    if (error) {
        console.error('Error:', error);
    } else {
        console.log(`Clusters with NULL category: ${count}`);
    }
}

main();
