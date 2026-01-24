import { NextResponse } from 'next/server';
import Parser from 'rss-parser';
import { createClient } from '@supabase/supabase-js';
import { scrapeArticle } from '@/lib/scraper';

// Configuration du parser avec un User-Agent pour éviter les blocages (403/404)
const parser = new Parser({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  },
});

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const { data: sources, error: sourcesError } = await supabase
      .from('sources')
      .select('*')
      .eq('is_active', true);

    if (sourcesError) throw sourcesError;

    const results = [];
    const errors = [];

    for (const source of sources) {
      try {
        const feed = await parser.parseURL(source.url);
        let skipped = 0;
        let added = 0;
        console.log(`[INGEST] Source: ${source.name} - ${feed.items.length} items in RSS`);

        for (const item of feed.items) {
          if (!item.link) continue;

          // Check if article already exists
          const { data: existing } = await supabase
            .from('articles')
            .select('id')
            .eq('source_url', item.link)
            .single();

          if (existing) {
            skipped++;
            continue; // Skip if already ingested
          }

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

            // Small delay to be respectful to source servers
            await sleep(500);
          } catch (scrapeErr) {
            console.warn(`[INGEST] Scrape failed for ${item.link}, using RSS content`);
          }

          const { data, error } = await supabase
            .from('articles')
            .upsert({
              title: item.title,
              content: content,
              source_url: item.link,
              source_name: source.name,
              author: item.creator || item.author,
              published_at: item.isoDate ? new Date(item.isoDate).toISOString() : new Date().toISOString(),
              category: source.category,
              image_url: imageUrl,
            }, { onConflict: 'source_url', ignoreDuplicates: true })
            .select()
            .single();

          if (error) {
            console.error(`[INGEST] Insert failed for "${item.title}": ${error.message}`);
          } else if (data) {
            added++;
            results.push(data);
          }
        }
        console.log(`[INGEST] Source ${source.name} - Skipped: ${skipped}, Added: ${added}`);

        await supabase
          .from('sources')
          .update({ last_fetched_at: new Date().toISOString() })
          .eq('id', source.id);

      } catch (sourceError: any) {
        console.error(`Erreur sur la source ${source.name}:`, sourceError.message);
        errors.push({ source: source.name, error: sourceError.message });
        // On continue avec la source suivante au lieu de tout arrêter
      }
    }

    return NextResponse.json({
      success: true,
      articlesIngested: results.length,
      failedSources: errors
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
