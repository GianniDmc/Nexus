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
    console.log('Starting harmonization...');

    // 1. Articles: Tech News -> Général
    const { error: err1 } = await supabase
        .from('articles')
        .update({ category: 'Général' })
        .eq('category', 'Tech News');
    if (err1) console.error('Error 1:', err1);
    else console.log('Updated Articles: Tech News -> Général');

    // 2. Articles: Apple/Smartphones -> Mobile
    const { error: err2 } = await supabase
        .from('articles')
        .update({ category: 'Mobile' })
        .in('category', ['Apple', 'Smartphones']);
    if (err2) console.error('Error 2:', err2);
    else console.log('Updated Articles: Apple/Smartphones -> Mobile');

    // 3. Sources: Tech News -> Général
    const { error: err3 } = await supabase
        .from('sources')
        .update({ category: 'Général' })
        .eq('category', 'Tech News');
    if (err3) console.error('Error 3:', err3);
    else console.log('Updated Sources: Tech News -> Général');

    // 4. Sources: Apple/Smartphones -> Mobile
    const { error: err4 } = await supabase
        .from('sources')
        .update({ category: 'Mobile' })
        .in('category', ['Apple', 'Smartphones']);
    if (err4) console.error('Error 4:', err4);
    else console.log('Updated Sources: Apple/Smartphones -> Mobile');

    console.log('Harmonization complete.');
}

main();
