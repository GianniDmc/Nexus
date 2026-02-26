import { generateEmbedding } from '../../ai';
import type { ProcessExecutionContext } from '../process-context';

export async function runEmbeddingStep(context: ProcessExecutionContext): Promise<void> {
  const { supabase, effectiveConfig, processingLimit, results, log } = context;

  while (context.isTimeSafelyRemaining() && !results.stopped) {
    const { data: needsEmbedding } = await supabase
      .from('articles')
      .select('id, title, content')
      .is('embedding', null)
      .order('created_at', { ascending: true })
      .limit(processingLimit);

    if (needsEmbedding && needsEmbedding.length > 0) {
      log(`[EMBED] Starting batch of ${needsEmbedding.length} articles...`);
    }

    if (!needsEmbedding || needsEmbedding.length === 0) {
      break;
    }

    let processedInBatch = 0;
    for (const article of needsEmbedding) {
      if (await context.shouldStop()) {
        results.stopped = true;
        break;
      }
      if (!context.isTimeSafelyRemaining()) {
        break;
      }

      try {
        const contentSnippet = article.content ? article.content.slice(0, 1000) : '';
        const textToEmbed = `${article.title}\n\n${contentSnippet}`;

        const embedding = await generateEmbedding(textToEmbed, effectiveConfig.geminiKey);

        if (embedding) {
          const { error: updateError } = await supabase.from('articles').update({ embedding }).eq('id', article.id);
          if (!updateError) {
            results.embeddings++;
            processedInBatch++;
          }
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        const maybeStatus = (error as { status?: number } | null)?.status;
        if (message.includes('429') || maybeStatus === 429) throw error;
        log(`[EMBED ERROR] Failed to embed article ${article.id}: ${message}`);
      }
    }

    if (processedInBatch === 0) break;
    await context.updateProgress(results.embeddings, -1, `Embedding: ${results.embeddings} traités...`);
  }
}
