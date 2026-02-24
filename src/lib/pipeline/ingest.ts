import Parser from 'rss-parser';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceSupabase } from '../supabase-admin';
import { scrapeArticle } from '../scraper';
import { getIngestionCutoff, PUBLICATION_RULES } from '../publication-rules';
import { resolveIngestExecutionPolicy, type ExecutionProfile } from './execution-policy';

// Configuration du parser avec un User-Agent pour éviter les blocages (403/404)
const parser = new Parser({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8'
  },
});

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export interface IngestOptions {
  sourceFilter?: string;
  executionProfile?: ExecutionProfile;
  batchSize?: number;
  batchDelayMs?: number;
  sourceConcurrency?: number;
  sourceTimeoutMs?: number;
  retrySourceTimeoutMs?: number;
  log?: (message: string) => void;
}

export interface IngestResult {
  success: boolean;
  articlesIngested: number;
  failedSources: { source: string; error: string }[];
}

type ActiveSource = {
  id: string;
  name: string;
  url: string;
  category: string;
  last_fetched_at: string | null;
  skip_scrape: boolean;
};

type ArticleInsertPayload = {
  title: string;
  content: string;
  source_url: string;
  source_name: string;
  author: string | undefined;
  published_at: string;
  category: string;
  image_url: string | null;
};

type SourceProcessResult =
  | { success: true; sourceName: string; added: number }
  | { success: false; sourceName: string; error: string };

function getItemAuthor(item: Parser.Item): string | undefined {
  const withLegacyAuthor = item as Parser.Item & { author?: string };
  return item.creator || withLegacyAuthor.author;
}

// Fonction pour traiter un batch d'articles en parallèle
async function processBatch(
  items: Parser.Item[],
  source: ActiveSource,
  supabase: SupabaseClient,
  log: (message: string) => void
): Promise<{ added: number }> {
  let added = 0;

  const processedItems = await Promise.all(
    items.map(async (item) => {
      if (!item.link) return null;

      // Get RSS content as baseline
      let content = item.contentSnippet || item.content || '';
      let imageUrl: string | null = null;

      // Extract image from RSS enclosure if available
      const itemWithEnclosure = item as Parser.Item & { enclosure?: { url?: string; type?: string } };
      if (itemWithEnclosure.enclosure?.url && itemWithEnclosure.enclosure.type?.startsWith('image')) {
        imageUrl = itemWithEnclosure.enclosure.url;
      }

      // Scrape source URL for og:image and richer content (unless source blocks it)
      if (!source.skip_scrape) {
        try {
          const scraped = await scrapeArticle(item.link);
          imageUrl = scraped.imageUrl || imageUrl;

          // Use scraped content if it's significantly longer than RSS snippet
          if (scraped.fullContent && scraped.fullContent.length > content.length * 1.5) {
            content = scraped.fullContent;
          }
        } catch {
          log(`[INGEST] Scrape failed for ${item.link}, using RSS content`);
        }
      }

      return {
        title: item.title || 'Sans titre',
        content,
        source_url: item.link,
        source_name: source.name,
        author: getItemAuthor(item),
        published_at: item.isoDate ? new Date(item.isoDate).toISOString() : new Date().toISOString(),
        category: source.category,
        image_url: imageUrl,
      } satisfies ArticleInsertPayload;
    })
  );

  // Filter out null items and batch upsert
  const validItems = processedItems.filter((item): item is ArticleInsertPayload => item !== null);

  if (validItems.length > 0) {
    const { data, error } = await supabase
      .from('articles')
      .upsert(validItems, { onConflict: 'source_url', ignoreDuplicates: true })
      .select();

    if (error) {
      log(`[INGEST] Batch upsert failed: ${error.message}`);
    } else if (data) {
      added = data.length;
    }
  }

  return { added };
}

async function processSource(
  source: ActiveSource,
  supabase: SupabaseClient,
  batchSize: number,
  batchDelayMs: number,
  sourceTimeoutMs: number,
  retrySourceTimeoutMs: number,
  log: (message: string) => void
): Promise<SourceProcessResult> {
  try {
    let feedText: string;

    // Custom fetch with simplified headers to avoid TLS fingerprinting issues
    const feedResponse = await fetch(source.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      signal: AbortSignal.timeout(sourceTimeoutMs)
    });

    if (!feedResponse.ok) {
      // Fallback: Try with a generic RSS reader agent if browser agent fails
      log(`[INGEST] Browser agent failed (${feedResponse.status}), retrying with generic agent...`);
      const retryResponse = await fetch(source.url, {
        headers: {
          'User-Agent': 'RSSReader/1.0 (compatible; MSIE 6.0; Windows NT 5.1)',
          'Accept': '*/*'
        },
        signal: AbortSignal.timeout(retrySourceTimeoutMs)
      });
      if (!retryResponse.ok) {
        throw new Error(`Failed to fetch RSS: ${retryResponse.status} ${retryResponse.statusText}`);
      }
      feedText = await retryResponse.text();
    } else {
      feedText = await feedResponse.text();
    }

    const feed = await parser.parseString(feedText);

    // Incrémental : cutoff basé sur le dernier fetch (avec 1h de marge), fallback 720h
    const safetyMarginMs = 60 * 60 * 1000;
    const ingestionCutoff = source.last_fetched_at
      ? new Date(new Date(source.last_fetched_at).getTime() - safetyMarginMs)
      : getIngestionCutoff();
    const allItems = feed.items;

    const validItems = allItems.filter((item) => {
      if (!item.link) return false;
      const pubDate = item.isoDate ? new Date(item.isoDate) : (item.pubDate ? new Date(item.pubDate) : new Date());
      return pubDate >= ingestionCutoff;
    });

    const skippedCount = allItems.length - validItems.length;
    const cutoffLabel = source.last_fetched_at ? 'last_fetch-1h' : `${PUBLICATION_RULES.INGESTION_MAX_AGE_HOURS}h`;
    log(`[INGEST] Source: ${source.name} - ${validItems.length} items to process (${skippedCount} older than ${cutoffLabel})`);

    let totalAdded = 0;

    // Process items in batches
    for (let i = 0; i < validItems.length; i += batchSize) {
      const batch = validItems.slice(i, i + batchSize);
      const { added } = await processBatch(batch, source, supabase, log);

      totalAdded += added;

      // Small delay between batches to be respectful to source servers
      if (i + batchSize < validItems.length) {
        await sleep(batchDelayMs);
      }
    }

    log(`[INGEST] Source ${source.name} - Added: ${totalAdded}`);

    await supabase
      .from('sources')
      .update({ last_fetched_at: new Date().toISOString() })
      .eq('id', source.id);

    return { success: true, added: totalAdded, sourceName: source.name };

  } catch (sourceError: unknown) {
    const message = sourceError instanceof Error ? sourceError.message : 'Unknown error';
    log(`Erreur sur la source ${source.name}: ${message}`);
    return { success: false, error: message, sourceName: source.name };
  }
}

export async function runIngest(options: IngestOptions = {}): Promise<IngestResult> {
  const supabase = getServiceSupabase();

  const log = options.log || console.log;
  const executionPolicy = resolveIngestExecutionPolicy({
    profile: options.executionProfile,
    overrides: {
      batchSize: options.batchSize,
      batchDelayMs: options.batchDelayMs,
      sourceConcurrency: options.sourceConcurrency,
      sourceTimeoutMs: options.sourceTimeoutMs,
      retrySourceTimeoutMs: options.retrySourceTimeoutMs,
    },
  });
  const batchSize = executionPolicy.batchSize;
  const batchDelayMs = executionPolicy.batchDelayMs;
  const sourceConcurrency = executionPolicy.sourceConcurrency;
  const sourceTimeoutMs = executionPolicy.sourceTimeoutMs;
  const retrySourceTimeoutMs = executionPolicy.retrySourceTimeoutMs;

  const sourceFilter = options.sourceFilter;

  try {
    let query = supabase.from('sources').select('*').eq('is_active', true);

    if (sourceFilter) {
      query = query.eq('name', sourceFilter);
    }

    const { data: sources, error: sourcesError } = await query;

    if (sourcesError) throw sourcesError;

    let totalAdded = 0;
    const allErrors: { source: string; error: string }[] = [];

    const safeSources = (sources || []) as ActiveSource[];

    // Process sources in chunks for concurrency
    for (let i = 0; i < safeSources.length; i += sourceConcurrency) {
      const chunk = safeSources.slice(i, i + sourceConcurrency);
      const chunkPromises = chunk.map(source =>
        processSource(
          source,
          supabase,
          batchSize,
          batchDelayMs,
          sourceTimeoutMs,
          retrySourceTimeoutMs,
          log
        )
      );

      const chunkResults = await Promise.all(chunkPromises);

      for (const res of chunkResults) {
        if (res.success) {
          totalAdded += res.added;
        } else {
          allErrors.push({ source: res.sourceName, error: res.error });
        }
      }
    }

    return {
      success: true,
      articlesIngested: totalAdded,
      failedSources: allErrors
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      articlesIngested: 0,
      failedSources: [{ source: 'global', error: message }]
    };
  }
}
