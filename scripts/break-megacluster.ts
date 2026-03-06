import { existsSync } from 'fs';
import { config } from 'dotenv';

// Only load .env.local if it exists (local dev). In CI, env vars are injected directly.
if (existsSync('.env.local')) {
    config({ path: '.env.local' });
}

import { createClient } from '@supabase/supabase-js';

/**
 * Script de nettoyage des mega-clusters.
 * Détache tous les articles d'un cluster volumineux pour qu'ils soient re-clusterisés
 * par le pipeline avec la nouvelle logique (seuil de cohérence 0.80 + meilleur cluster).
 *
 * Usage :
 *   npx tsx scripts/break-megacluster.ts [--label "texte"] [--min-size 100] [--dry-run]
 *
 * Options :
 *   --label     Recherche partielle dans le label du cluster (insensible à la casse)
 *   --min-size  Taille minimum pour considérer un cluster comme "mega" (défaut: 100)
 *   --dry-run   Affiche les clusters concernés sans modifier la base
 */

function parseArgs() {
    const args = process.argv.slice(2);
    let label: string | undefined;
    let minSize = 100;
    let dryRun = false;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--label' && args[i + 1]) {
            label = args[i + 1];
            i++;
        } else if (args[i] === '--min-size' && args[i + 1]) {
            minSize = parseInt(args[i + 1], 10);
            i++;
        } else if (args[i] === '--dry-run') {
            dryRun = true;
        }
    }

    return { label, minSize, dryRun };
}

// Fonction utilitaire pour diviser un tableau en chunks
function chunk<T>(array: T[], size: number): T[][] {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
}

async function main() {
    const { label, minSize, dryRun } = parseArgs();

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
        process.exit(1);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Trouver les mega-clusters
    console.log(`🔍 Recherche des mega-clusters (min ${minSize} articles${label ? `, label contient "${label}"` : ''})...`);

    const { data: megaClusters, error: searchError } = await supabase.rpc('get_multi_article_clusters');

    if (searchError) {
        console.error('❌ Erreur recherche clusters:', searchError.message);
        process.exit(1);
    }

    type ClusterRow = { id: string; label: string; article_count: number; is_published: boolean; final_score: number | null };
    const candidates = (megaClusters as ClusterRow[])
        .filter(c => c.article_count >= minSize)
        .filter(c => !label || c.label?.toLowerCase().includes(label.toLowerCase()));

    if (candidates.length === 0) {
        console.log('✅ Aucun mega-cluster trouvé avec ces critères.');
        return;
    }

    console.log(`\n📋 ${candidates.length} mega-cluster(s) trouvé(s) :\n`);
    for (const c of candidates) {
        console.log(`  • "${c.label}" — ${c.article_count} articles (score: ${c.final_score ?? 'N/A'}, publié: ${c.is_published})`);
    }

    if (dryRun) {
        console.log('\n🔍 Mode --dry-run : aucune modification effectuée.');
        return;
    }

    // 2. Pour chaque mega-cluster, détacher les articles par lots et supprimer le cluster
    for (const cluster of candidates) {
        console.log(`\n🔄 Traitement du cluster "${cluster.label}" (${cluster.article_count} articles)...`);

        // Récupérer d'abord les IDs de tous les articles du cluster
        const { data: articlesToDetach, error: fetchError } = await supabase
            .from('articles')
            .select('id')
            .eq('cluster_id', cluster.id);

        if (fetchError || !articlesToDetach) {
            console.error(`  ❌ Erreur récupération IDs articles: ${fetchError?.message}`);
            continue;
        }

        const articleIds = articlesToDetach.map(a => a.id);
        const BATCH_SIZE = 50;
        const batches = chunk(articleIds, BATCH_SIZE);

        let totalDetached = 0;

        for (const [index, batch] of batches.entries()) {
            process.stdout.write(`  ⏳ Détachement batch ${index + 1}/${batches.length} (${batch.length} articles)... `);

            const { error: detachError } = await supabase
                .from('articles')
                .update({ cluster_id: null, relevance_score: null, final_score: null, is_published: false, published_on: null })
                .in('id', batch);

            if (detachError) {
                console.log(`❌ Erreur: ${detachError.message}`);
                continue;
            }

            totalDetached += batch.length;
            console.log(`✅`);
        }

        console.log(`  ✅ ${totalDetached} articles détachés avec succès`);

        // Supprimer le summary associé s'il existe
        const { error: summaryDeleteError } = await supabase
            .from('summaries')
            .delete()
            .eq('cluster_id', cluster.id);

        if (summaryDeleteError) {
            console.warn(`  ⚠️ Erreur suppression summary: ${summaryDeleteError.message}`);
        } else {
            console.log(`  🗑️ Summary associé supprimé`);
        }

        // Supprimer le cluster
        const { error: deleteError } = await supabase
            .from('clusters')
            .delete()
            .eq('id', cluster.id);

        if (deleteError) {
            console.error(`  ❌ Erreur suppression cluster: ${deleteError.message}`);
        } else {
            console.log(`  🗑️ Cluster supprimé`);
        }
    }

    console.log(`\n✅ Terminé. Les articles détachés seront re-clusterisés lors du prochain cycle de processing.`);
    console.log(`   Lancez le pipeline pour re-clusteriser : npm run cron:process`);
}

main().catch((error) => {
    console.error('[BREAK-MEGACLUSTER] Erreur fatale:', error);
    process.exitCode = 1;
});
