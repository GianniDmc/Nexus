import * as cheerio from 'cheerio';

interface ScrapedArticle {
    imageUrl: string | null;
    fullContent: string | null;
}

function isScraperQuiet(): boolean {
    return process.env.QUIET_LOGS === '1' || process.env.SCRAPER_QUIET === '1';
}

function scraperWarn(message: string): void {
    if (!isScraperQuiet()) {
        console.warn(message);
    }
}

function scraperInfo(message: string): void {
    if (!isScraperQuiet()) {
        console.log(message);
    }
}

/**
 * Scrape an article page to extract og:image and main content.
 * Returns partial data if some extraction fails.
 */
export async function scrapeArticle(url: string): Promise<ScrapedArticle> {
    const result: ScrapedArticle = {
        imageUrl: null,
        fullContent: null,
    };

    // Skip scraping for known binary files
    if (url.match(/\.(pdf|jpg|jpeg|png|gif|zip|rar|dmg)$/i)) {
        scraperInfo(`[SCRAPER] Skipping binary file: ${url}`);
        return result;
    }

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1'
            },
            signal: AbortSignal.timeout(10000), // 10s timeout
        });

        if (!response.ok) {
            // Retry with generic agent for 403s
            if (response.status === 403) {
                scraperWarn(`[SCRAPER] Browser agent failed for ${url} (403), retrying with generic agent...`);
                try {
                    const retryResponse = await fetch(url, {
                        headers: {
                            'User-Agent': 'RSSReader/1.0 (compatible; MSIE 6.0; Windows NT 5.1)',
                            'Accept': '*/*'
                        },
                        signal: AbortSignal.timeout(10000)
                    });

                    if (retryResponse.ok) {
                        const html = await retryResponse.text();
                        return parseHtml(html); // Helper function extraction needed or duplicate logic
                    }
                } catch {
                    scraperWarn(`[SCRAPER] Retry failed for ${url}`);
                }
            }

            scraperWarn(`Failed to fetch ${url}: ${response.status}`);
            return result;
        }

        const html = await response.text();
        return parseHtml(html);

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        scraperWarn(`Scraping error for ${url}: ${message}`);
    }

    return result;
}

function parseHtml(html: string): ScrapedArticle {
    const result: ScrapedArticle = {
        imageUrl: null,
        fullContent: null,
    };

    const $ = cheerio.load(html);

    // Extract og:image
    result.imageUrl =
        $('meta[property="og:image"]').attr('content') ||
        $('meta[name="twitter:image"]').attr('content') ||
        $('meta[property="og:image:url"]').attr('content') ||
        null;

    // Extract main content
    // Priority: article tag > main tag > common content selectors
    const contentSelectors = [
        'article',
        'main',
        '[role="main"]',
        '.post-content',
        '.article-content',
        '.entry-content',
        '.content-body',
        '.story-body',
        '#article-body',
    ];

    let contentElement = null;
    for (const selector of contentSelectors) {
        const el = $(selector);
        if (el.length > 0) {
            contentElement = el.first();
            break;
        }
    }

    if (contentElement) {
        // Remove unwanted elements
        contentElement.find('script, style, nav, aside, footer, .ad, .advertisement, .social-share, .related-posts, .comments').remove();

        // Get text content, clean it up
        const paragraphs = contentElement.find('p');
        const textParts: string[] = [];

        paragraphs.each((_, p) => {
            const text = $(p).text().trim();
            if (text.length > 50) { // Skip very short paragraphs (likely navigation, etc.)
                textParts.push(text);
            }
        });

        if (textParts.length > 0) {
            result.fullContent = textParts.join('\n\n');
        }
    }

    // Fallback: if no structured content, try body paragraphs
    if (!result.fullContent) {
        const bodyParagraphs = $('body p');
        const textParts: string[] = [];

        bodyParagraphs.each((_, p) => {
            const text = $(p).text().trim();
            if (text.length > 80) {
                textParts.push(text);
            }
        });

        if (textParts.length >= 3) {
            result.fullContent = textParts.slice(0, 20).join('\n\n'); // Limit to first 20 paragraphs
        }
    }

    return result;
}
