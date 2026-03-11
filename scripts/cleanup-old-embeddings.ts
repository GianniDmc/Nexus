/**
 * Script de nettoyage des vieux embeddings
 * 
 * Supprime les vecteurs d'embedding des articles :
 * - Déjà clusterisés (cluster_id IS NOT NULL)
 * - Créés il y a plus de 30 jours
 *
 * Le garde-fou `.is('cluster_id', null)` dans embedding-step.ts
 * garantit que ces articles ne seront PAS ré-embeddés.
 *
 * Usage : npx tsx scripts/cleanup-old-embeddings.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
    console.error('❌ Missing SUPABASE env vars');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const DAYS_THRESHOLD = 30;
const BATCH_SIZE = 500;

async function main() {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - DAYS_THRESHOLD);
    const cutoffISO = cutoffDate.toISOString();

    console.log(`\n🧹 Nettoyage des embeddings — articles clusterisés avant le ${cutoffDate.toLocaleDateString('fr-FR')}\n`);

    // 1. Compter les articles concernés
    const { count: totalEligible } = await supabase
        .from('articles')
        .select('id', { count: 'exact', head: true })
        .not('embedding', 'is', null)
        .not('cluster_id', 'is', null)
        .lt('created_at', cutoffISO);

    console.log(`📊 Articles éligibles au nettoyage : ${totalEligible ?? 0}`);

    if (!totalEligible || totalEligible === 0) {
        console.log('✅ Rien à nettoyer. Fin.');
        return;
    }

    // 2. Estimation de la taille récupérée
    // Un vecteur 768 dimensions × 4 bytes (float32) ≈ 3 KB par article
    const estimatedSavingMB = ((totalEligible * 3) / 1024).toFixed(1);
    console.log(`💾 Estimation de l'espace récupéré : ~${estimatedSavingMB} MB\n`);

    // 3. Nettoyage par batches
    let cleaned = 0;

    while (cleaned < totalEligible) {
        const { data: batch, error: fetchError } = await supabase
            .from('articles')
            .select('id')
            .not('embedding', 'is', null)
            .not('cluster_id', 'is', null)
            .lt('created_at', cutoffISO)
            .limit(BATCH_SIZE);

        if (fetchError) {
            console.error('❌ Erreur fetch:', fetchError.message);
            break;
        }

        if (!batch || batch.length === 0) break;

        const ids = batch.map(a => a.id);

        const { error: updateError } = await supabase
            .from('articles')
            .update({ embedding: null })
            .in('id', ids);

        if (updateError) {
            console.error('❌ Erreur update:', updateError.message);
            break;
        }

        cleaned += ids.length;
        const pct = Math.round((cleaned / totalEligible) * 100);
        process.stdout.write(`\r🔄 Progression : ${cleaned}/${totalEligible} (${pct}%)`);
    }

    console.log(`\n\n✅ Nettoyage terminé : ${cleaned} embeddings supprimés.`);
    console.log(`💡 Ces articles ne seront PAS ré-embeddés grâce au garde-fou dans embedding-step.ts.`);
}

main().catch(err => {
    console.error('❌ Erreur fatale:', err);
    process.exit(1);
});
