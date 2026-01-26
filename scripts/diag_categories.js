const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkCategories() {
    const { data, error } = await supabase.from('articles').select('category');
    if (error) {
        console.error(error);
        return;
    }

    const counts = {};
    data.forEach(a => {
        const cat = a.category || 'NULL';
        counts[cat] = (counts[cat] || 0) + 1;
    });

    console.log("Category Distribution:");
    Object.entries(counts)
        .sort(([, a], [, b]) => b - a)
        .forEach(([k, v]) => console.log(`${k}: ${v}`));
}

checkCategories();
