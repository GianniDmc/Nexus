import OpenAI from 'openai';
import { pipeline } from '@xenova/transformers';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Clients
const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

const genAI = process.env.GOOGLE_API_KEY ? new GoogleGenerativeAI(process.env.GOOGLE_API_KEY) : null;

// Helpers
let embeddingPipeline: any = null;
const maxLlmAttempts = 3;
const baseRetryDelayMs = 2000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const createChatCompletion = async (
  payload: Omit<OpenAI.Chat.Completions.ChatCompletionCreateParams, 'stream'> & { stream?: false }
): Promise<any> => {
  let lastError: unknown;

  // 1. Try Google Gemini (Primary Strategy)
  if (genAI) {
    try {
      // Use 'gemini-3-flash-preview' as updated by user.
      const geminiModel = genAI.getGenerativeModel({
        model: "gemini-3-flash-preview",
        generationConfig: { responseMimeType: payload.response_format?.type === 'json_object' ? "application/json" : "text/plain" }
      });

      let prompt = "";
      // Convert OpenAI messages to Gemini Prompt
      if (Array.isArray(payload.messages)) {
        prompt = payload.messages.map((m: any) => `${m.role === 'user' ? '' : '[System/Context]: '}${m.content}`).join('\n');
      } else {
        prompt = "Requete: " + JSON.stringify(payload);
      }

      const result = await geminiModel.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      return {
        choices: [{
          message: { content: text }
        }]
      };

    } catch (e) {
      console.warn("⚠️ Gemini Primary Strategy Failed (Falling back to Groq):", e);
    }
  }

  // 2. Fallback to Groq (Llama 3)
  for (let attempt = 0; attempt < maxLlmAttempts; attempt += 1) {
    try {
      return await groq.chat.completions.create({ ...payload, stream: false });
    } catch (error) {
      lastError = error;
      const delay = baseRetryDelayMs * Math.pow(2, attempt);
      if (attempt < maxLlmAttempts - 1) await sleep(delay);
    }
  }

  console.error("❌ All AI Providers Failed.");
  throw lastError;
};

/**
 * Scoring par lot (Batch) pour économiser les requêtes API (Rate Limit).
 * Traite jusqu'à 10-20 articles en une seule fois.
 */
export async function scoreBatchArticles(articles: { id: string, title: string, content: string }[]) {
  if (articles.length === 0) return {};

  const articlesText = articles.map(a => `ID: ${a.id}\nTITRE: ${a.title}\nEXTRAIT: ${a.content?.substring(0, 300)}`).join('\n\n---\n\n');

  const prompt = `
Tu es un éditeur chef. Note ces articles tech de 0 à 10 (Critères: originalité, profondeur, impact).
Si un article est du spam, score = 0.
Articles à noter:
${articlesText}

Réponds UNIQUEMENT un JSON map { "id_article": score_number, ... }.
Exemple: { "123": 8, "456": 2 }
`;

  try {
    const response = await createChatCompletion({
      model: 'llama-3.3-70b-versatile', // Fallback value, Gemini uses its own logic
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' }
    });

    return JSON.parse(response.choices[0].message.content || '{}');
  } catch (error) {
    console.warn("⚠️ Batch Scoring Failed (Retrying 1-by-1 Serial Fallback):", error);

    // Serial Fallback: Process articles one by one
    const results: Record<string, number> = {};
    for (const article of articles) {
      try {
        const score = await scoreArticleRelevance(article.title, article.content);
        results[article.id] = score;
        // Short pause to be gentle
        await sleep(500);
      } catch (e) {
        console.error(`Failed to score article ${article.id} in fallback`, e);
        results[article.id] = 0;
      }
    }
    return results;
  }
}

/**
 * Scoring rapide pour filtrer le bruit.
 */
export async function scoreArticleRelevance(title: string, content: string) {
  // Legacy Wrapper - prefer batching
  const result = await scoreBatchArticles([{ id: 'temp', title, content }]);
  return result['temp'] || 0;
}

export function computeFinalScore(
  baseScore: number,
  options: { contentLength?: number; publishedAt?: string | Date; sourcesCount?: number }
) {
  let score = baseScore;

  if (options.sourcesCount && options.sourcesCount >= 2) {
    score += 0.5;
  }

  if (options.contentLength && options.contentLength > 1200) {
    score += 0.2;
  }

  if (options.publishedAt) {
    const publishedAt = new Date(options.publishedAt).getTime();
    const ageHours = (Date.now() - publishedAt) / (1000 * 60 * 60);
    if (ageHours <= 12) {
      score += 0.3;
    }
  }

  return Math.min(10, Math.round(score * 10) / 10);
}

/**
 * Réécriture complète d'un article en français.
 * Fonctionne avec une OU plusieurs sources.
 */
export async function rewriteArticle(sources: { title: string, content: string, source_name: string }[]) {
  const isMultiSource = sources.length > 1;
  const sourcesText = sources.map((s, i) => `[${s.source_name}]: ${s.content}`).join('\n\n---\n\n');

  const prompt = `
Tu es journaliste tech senior pour Nexus. Réécris cette actualité en français.

${isMultiSource ? 'SOURCES MULTIPLES (compile les informations uniques):' : 'SOURCE UNIQUE:'}
${sourcesText}

EXIGENCES:
1. TITRE: Accrocheur, factuel, en français.
2. CONTENU: 3-4 paragraphes. Contexte, faits, analyse. Pas de jargon inutile.
3. TON: Professionnel, neutre, précis. Inspiré du NYT/Les Échos.
4. LANGUE: Français impeccable.

FORMAT JSON:
{
  "title": "Titre en français",
  "content": "L'article complet réécrit...",
  "tldr": "Résumé en 2 phrases maximum.",
  "impact": "Pourquoi c'est important (1 phrase)."
}`;

  try {
    const response = await createChatCompletion({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });
    return JSON.parse(response.choices[0].message.content || '{}');
  } catch (error) {
    console.error('Rewrite Error:', error);
    return null;
  }
}

export async function generateEmbedding(text: string) {
  try {
    if (!embeddingPipeline) {
      embeddingPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    }
    const output = await embeddingPipeline(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data) as number[];
  } catch (error) {
    return null;
  }
}

export async function generateDailyDigest(articles: any[]) {
  const articlesText = articles.map(a => `- ${a.title}`).join('\n');
  const prompt = `Rédige le Digest Nexus du jour. 5 points clés. JSON: {"title": "...", "intro": "...", "essentials": ["..."]}. Articles: ${articlesText}`;
  try {
    const response = await createChatCompletion({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });
    return JSON.parse(response.choices[0].message.content || '{}');
  } catch (error) {
    return null;
  }
}
