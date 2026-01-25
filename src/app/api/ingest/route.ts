import { NextResponse } from 'next/server';
import Parser from 'rss-parser';
import { createClient } from '@supabase/supabase-js';
import { scrapeArticle } from '@/lib/scraper';
import { getIngestionCutoff, PUBLICATION_RULES } from '@/lib/publication-rules';

// Configuration du parser avec un User-Agent pour éviter les blocages (403/404)
const parser = new Parser({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  },
});

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Configuration de la parallélisation
const BATCH_SIZE = 10; // Increased from 5
const BATCH_DELAY_MS = 200; // Reduced from 300
const SOURCE_CONCURRENCY = 3; // New: Process 3 sources in parallel

// Fonction pour traiter un batch d'articles en parallèle
async function processBatch(
  items: Parser.Item[],
  source: { name: string; category: string },
  supabase: any // Relax type to avoid strict Generic mismatch during build
): Promise<{ added: number; results: any[] }> {
  let added = 0;
  const results: any[] = [];

  const processedItems = await Promise.all(
    items.map(async (item) => {
      if (!item.link) return null;

      // Get RSS content as baseline
      let content = item.contentSnippet || item.content || '';
      let imageUrl: string | null = null;

      // Scrape source URL for og:image and potentially richer content
      try {
        const scraped = await scrapeArticle(item.link);
        imageUrl = scraped.imageUrl;

        // Use scraped content if it's significantly longer than RSS snippet
        if (scraped.fullContent && scraped.fullContent.length > content.length * 1.5) {
          content = scraped.fullContent;
        }
      } catch (scrapeErr) {
        console.warn(`[INGEST] Scrape failed for ${item.link}, using RSS content`);
      }

      return {
        title: item.title || 'Sans titre',
        content: content,
        source_url: item.link,
        source_name: source.name,
        author: item.creator || (item as any).author,
        published_at: item.isoDate ? new Date(item.isoDate).toISOString() : new Date().toISOString(),
        category: source.category,
        image_url: imageUrl,
      };
    })
  );

  // Filter out null items and batch upsert
  const validItems = processedItems.filter(item => item !== null);

  if (validItems.length > 0) {
    const { data, error } = await supabase
      .from('articles')
      .upsert(validItems as any, { onConflict: 'source_url', ignoreDuplicates: true })
      .select();

    if (error) {
      console.error(`[INGEST] Batch upsert failed: ${error.message}`);
    } else if (data) {
      added = data.length;
      results.push(...data);
    }
  }

  return { added, results };
}

async function processSource(source: any, supabase: any) {
  const results: any[] = [];

  try {
    const feed = await parser.parseURL(source.url);

    const ingestionCutoff = getIngestionCutoff();
    const allItems = feed.items;

    const validItems = allItems.filter(item => {
      if (!item.link) return false;
      const pubDate = item.isoDate ? new Date(item.isoDate) : (item.pubDate ? new Date(item.pubDate) : new Date());
      return pubDate >= ingestionCutoff;
    });

    const skippedCount = allItems.length - validItems.length;
    console.log(`[INGEST] Source: ${source.name} - ${validItems.length} items to process (${skippedCount} older than ${PUBLICATION_RULES.INGESTION_MAX_AGE_HOURS}h)`);

    let totalAdded = 0;

    // Process items in batches
    for (let i = 0; i < validItems.length; i += BATCH_SIZE) {
      const batch = validItems.slice(i, i + BATCH_SIZE);
      const { added, results: batchResults } = await processBatch(batch, source, supabase);

      totalAdded += added;
      results.push(...batchResults);

      // Small delay between batches to be respectful to source servers
      if (i + BATCH_SIZE < validItems.length) {
        await sleep(BATCH_DELAY_MS);
      }
    }

    console.log(`[INGEST] Source ${source.name} - Added: ${totalAdded}`);

    await supabase
      .from('sources')
      .update({ last_fetched_at: new Date().toISOString() })
      .eq('id', source.id);

    return { success: true, results, sourceName: source.name };

  } catch (sourceError: any) {
    console.error(`Erreur sur la source ${source.name}:`, sourceError.message);
    return { success: false, error: sourceError.message, sourceName: source.name };
  }
}

export async function GET(req: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { searchParams } = new URL(req.url);
  const sourceFilter = searchParams.get('source'); // Filter by source name

  try {
    let query = supabase.from('sources').select('*').eq('is_active', true);

    if (sourceFilter) {
      query = query.eq('name', sourceFilter);
    }

    const { data: sources, error: sourcesError } = await query;

    if (sourcesError) throw sourcesError;

    const allResults: any[] = [];
    const allErrors: { source: string; error: string }[] = [];

    // Process sources in chunks for concurrency
    for (let i = 0; i < sources.length; i += SOURCE_CONCURRENCY) {
      const chunk = sources.slice(i, i + SOURCE_CONCURRENCY);
      const chunkPromises = chunk.map(source => processSource(source, supabase));

      const chunkResults = await Promise.all(chunkPromises);

      for (const res of chunkResults) {
        if (res.success) {
          allResults.push(...res.results);
        } else {
          allErrors.push({ source: res.sourceName, error: res.error });
        }
      }
    }

    return NextResponse.json({
      success: true,
      articlesIngested: allResults.length,
      failedSources: allErrors
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
