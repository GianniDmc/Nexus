import * as cheerio from 'cheerio';

interface ScrapedArticle {
    imageUrl: string | null;
    fullContent: string | null;
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

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            signal: AbortSignal.timeout(10000), // 10s timeout
        });

        if (!response.ok) {
            console.warn(`Failed to fetch ${url}: ${response.status}`);
            return result;
        }

        const html = await response.text();
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

    } catch (error: any) {
        console.warn(`Scraping error for ${url}:`, error.message);
    }

    return result;
}
