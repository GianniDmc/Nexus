
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { PUBLICATION_RULES, getFreshnessCutoff } from '../src/lib/publication-rules';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function debugFilters() {
    console.log("--- DEBUG ADMIN API FILTERS ---");
    console.log(`THRESHOLD: ${PUBLICATION_RULES.PUBLISH_THRESHOLD}`);
    console.log(`MIN_SOURCES: ${PUBLICATION_RULES.MIN_SOURCES}`);

    // TEST 1: Check 'Final Score' Type and Distribution
    console.log("\n[TEST 1] Sample Clusters Score Types:");
    const { data: sample } = await supabase.from('clusters').select('id, label, final_score').not('final_score', 'is', null).limit(5);
    sample?.forEach(c => {
        console.log(`- ${c.label.substring(0, 30)}... | Score: ${c.final_score} (${typeof c.final_score})`);
    });

    // TEST 2: Simulate 'ready' query (gte 8)
    console.log("\n[TEST 2] Query 'ready' (gte 8 + not published):");
    const { data: readyCandidates, error: readyError } = await supabase
        .from('clusters')
        .select('id, label, final_score, is_published')
        .gte('final_score', PUBLICATION_RULES.PUBLISH_THRESHOLD)
        .eq('is_published', false)
        .limit(10);

    if (readyError) console.error("Ready Query Error:", readyError);
    else {
        console.log(`Found ${readyCandidates.length} potential ready clusters.`);
        readyCandidates.forEach(c => {
            if (c.final_score < PUBLICATION_RULES.PUBLISH_THRESHOLD) {
                console.error(`!!! INVALID RESULT: ID ${c.id} has score ${c.final_score} < ${PUBLICATION_RULES.PUBLISH_THRESHOLD}`);
            } else {
                console.log(`OK: ${c.final_score} - ${c.label.substring(0, 20)}`);
            }
        });
    }

    // TEST 3: Simulate 'eligible' (Reverse Lookup)
    console.log("\n[TEST 3] Query 'eligible' (Reverse Lookup):");
    const cutoff = getFreshnessCutoff();
    console.log(`Cutoff: ${cutoff}`);

    const { data: fresh } = await supabase
        .from('articles')
        .select('cluster_id, published_at')
        .gte('published_at', cutoff)
        .limit(10);

    console.log(`Fresh Articles found: ${fresh?.length || 0}`);
    if (fresh && fresh.length > 0) {
        console.log("Sample Fresh Article:", fresh[0]);
    } else {
        console.warn("!! NO FRESH ARTICLES FOUND. 'Active Candidates' will be empty.");
    }
}

debugFilters().catch(console.error);
