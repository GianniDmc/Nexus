import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { count: nullEmbeddingsAndNullClusterId } = await supabase.from('articles').select('*', { count: 'exact', head: true }).is('embedding', null).is('cluster_id', null);
  const { count: nullEmbeddingsAndNotNullClusterId } = await supabase.from('articles').select('*', { count: 'exact', head: true }).is('embedding', null).not('cluster_id', 'is', null);
  const { count: allNullEmbeddings } = await supabase.from('articles').select('*', { count: 'exact', head: true }).is('embedding', null);

  console.log(`Articles avec embedding = null : ${allNullEmbeddings}`);
  console.log(`  - dont cluster_id = null : ${nullEmbeddingsAndNullClusterId} <- Ceux-là seront traités`);
  console.log(`  - dont cluster_id != null : ${nullEmbeddingsAndNotNullClusterId} <- Ceux-là sont bloqués (garde-fou)`);
}

check();
