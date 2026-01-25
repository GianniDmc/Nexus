import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';

// Initialize default Clients
const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

// Lazy initialization for Gemini to ensure env vars are loaded
let _genAI: GoogleGenerativeAI | null = null;
const getGenAI = () => {
  if (!_genAI && process.env.GOOGLE_API_KEY) {
    _genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  }
  return _genAI;
};

// Custom config type (passed from frontend when user provides their own keys)
export interface AIOverrideConfig {
  openaiKey?: string;
  anthropicKey?: string;
  geminiKey?: string;
  preferredProvider?: 'auto' | 'openai' | 'anthropic' | 'gemini';
}

// Helpers
const maxLlmAttempts = 3;
const baseRetryDelayMs = 2000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const createChatCompletion = async (
  payload: Omit<OpenAI.Chat.Completions.ChatCompletionCreateParams, 'stream'> & { stream?: false },
  overrideConfig?: AIOverrideConfig,
  modelTier: 'fast' | 'smart' = 'smart'
): Promise<any> => {
  let lastError: unknown;
  const pref = overrideConfig?.preferredProvider || 'auto';

  const getPrompt = () => {
    if (Array.isArray(payload.messages)) {
      return payload.messages.map((m: any) => `${m.role === 'user' ? '' : '[System/Context]: '}${m.content}`).join('\n');
    }
    return "Requete: " + JSON.stringify(payload);
  };

  // 1. Try user-provided OpenAI
  if ((pref === 'openai' || pref === 'auto') && overrideConfig?.openaiKey) {
    try {
      const client = new OpenAI({ apiKey: overrideConfig.openaiKey });
      console.log('🔑 Using custom OpenAI key');
      const model = modelTier === 'fast' ? 'gpt-5-mini' : 'gpt-5.2'; // gpt-5-mini for fast/cheap, gpt-5.2 for quality
      return await client.chat.completions.create({
        ...payload,
        model,
        stream: false
      });
    } catch (e) {
      console.warn("⚠️ Custom OpenAI failed:", e);
      lastError = e;
    }
  }

  // 2. Try user-provided Anthropic
  if ((pref === 'anthropic' || pref === 'auto') && overrideConfig?.anthropicKey) {
    try {
      const client = new Anthropic({ apiKey: overrideConfig.anthropicKey });
      console.log('🔑 Using custom Anthropic key');
      // Haiku 4.5 ($1.00) for fast, Sonnet 4.5 ($3.00) for smart
      const model = modelTier === 'fast' ? 'claude-haiku-4-5' : 'claude-sonnet-4-5-20250929';
      const response = await client.messages.create({
        model,
        max_tokens: 4096,
        messages: [{ role: 'user', content: getPrompt() }]
      });
      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      return { choices: [{ message: { content: text } }] };
    } catch (e) {
      console.warn("⚠️ Custom Anthropic failed:", e);
      lastError = e;
    }
  }

  // 3. Try Gemini (user-provided or default)
  const geminiKey = overrideConfig?.geminiKey || process.env.GOOGLE_API_KEY;
  if ((pref === 'gemini' || pref === 'auto') && geminiKey) {
    try {
      const genAI = overrideConfig?.geminiKey
        ? new GoogleGenerativeAI(overrideConfig.geminiKey)
        : getGenAI();

      if (genAI) {
        if (overrideConfig?.geminiKey) console.log('🔑 Using custom Gemini key');
        const geminiModel = genAI.getGenerativeModel({
          model: "gemini-3-flash-preview", // Updated to 2026 standard
          generationConfig: { responseMimeType: payload.response_format?.type === 'json_object' ? "application/json" : "text/plain" }
        });
        const result = await geminiModel.generateContent(getPrompt());
        return { choices: [{ message: { content: result.response.text() } }] };
      }
    } catch (e) {
      console.warn("⚠️ Gemini failed:", e);
      lastError = e;
    }
  }

  // 4. Fallback to Groq (Llama 3)
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
 */
export async function scoreBatchArticles(
  articles: { id: string, title: string, content: string }[],
  overrideConfig?: AIOverrideConfig
) {
  if (articles.length === 0) return {};

  const articlesText = articles.map(a => `ID: ${a.id}\nTITRE: ${a.title}\nEXTRAIT: ${a.content?.substring(0, 500)}`).join('\n\n---\n\n');

  const prompt = `
Tu es un curateur tech passionné. Note ces articles de 0 à 10 selon leur intérêt pour un lecteur curieux.

Critères de notation :
- **Intérêt** (50%) : L'article est-il captivant, instructif ou surprenant ?
- **Originalité** (30%) : Apporte-t-il un angle nouveau ou une info rare ?
- **Clarté** (20%) : Le contenu est-il bien écrit et compréhensible ?

Pénalités :
- Contenu promotionnel/publireportage → -3 points
- Clickbait sans substance → -4 points
- Spam ou contenu non pertinent → Score = 0

Articles à noter:
${articlesText}

Réponds UNIQUEMENT un JSON map { "id_article": score_number, ... }.
Exemple: { "123": 8, "456": 2 }
`;

  try {
    const response = await createChatCompletion({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' }
    }, overrideConfig, 'fast'); // Scoring = Fast/Cheap

    return JSON.parse(response.choices[0].message.content || '{}');
  } catch (error) {
    console.warn("⚠️ Batch Scoring Failed (Retrying 1-by-1 Serial Fallback):", error);

    const results: Record<string, number> = {};
    for (const article of articles) {
      try {
        const score = await scoreArticleRelevance(article.title, article.content, overrideConfig);
        results[article.id] = score;
        await sleep(500);
      } catch (e) {
        console.error(`Failed to score article ${article.id} in fallback`, e);
        results[article.id] = 0;
      }
    }
    return results;
  }
}

export async function scoreArticleRelevance(title: string, content: string, overrideConfig?: AIOverrideConfig) {
  const result = await scoreBatchArticles([{ id: 'temp', title, content }], overrideConfig);
  return result['temp'] || 0;
}

export function computeFinalScore(
  baseScore: number,
  options: { contentLength?: number; publishedAt?: string | Date; sourcesCount?: number }
) {
  let score = baseScore;
  if (options.sourcesCount && options.sourcesCount >= 2) score += 0.5;
  if (options.contentLength && options.contentLength > 1200) score += 0.2;
  if (options.publishedAt) {
    const publishedAt = new Date(options.publishedAt).getTime();
    const ageHours = (Date.now() - publishedAt) / (1000 * 60 * 60);
    if (ageHours <= 12) score += 0.3;
  }
  return Math.min(10, Math.round(score * 10) / 10);
}

// Nouvelle fonction Cluster-Centric Scoring
export async function scoreCluster(
  articles: { id: string, title: string, content: string, source_name: string }[],
  overrideConfig?: AIOverrideConfig
) {
  if (articles.length === 0) return { score: 0, representative_id: null };

  const articlesText = articles.map(a => `ID: ${a.id}\nSOURCE: ${a.source_name}\nTITRE: ${a.title}\nEXTRAIT: ${a.content?.substring(0, 500)}`).join('\n\n---\n\n');

  const prompt = `
Tu es un rédacteur en chef Tech. Évalue l'intérêt de ce SUJET d'actualité (regroupé en cluster d'articles).

Critères (Score 0-10) :
- Impact : Est-ce une news majeure ou anecdotique ?
- Tech Focus : Est-ce pertinent pour une veille technologique ? (Politique/Fait divers = 0 sauf si impact tech majeur).
- Fraîcheur : Est-ce une info récente ?

Tâche :
1. Donne un score global au sujet (0-10).
2. Identifie l'ID de l'article le plus complet/informatif qui servira de base pour la synthèse (representative_id).

Articles du cluster :
${articlesText}

Réponds UNIQUEMENT un JSON : { "score": number, "representative_id": "uuid_string" }
`;

  try {
    const response = await createChatCompletion({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' }
    }, overrideConfig, 'fast'); // Scoring is fast

    const result = JSON.parse(response.choices[0].message.content || '{}');
    return {
      score: typeof result.score === 'number' ? result.score : 0,
      representative_id: result.representative_id || articles[0].id
    };
  } catch (error) {
    console.error("Cluster Scoring Failed:", error);
    // Fallback: Moyenne ou 0, et premier article par défaut
    return { score: 0, representative_id: articles.length > 0 ? articles[0].id : null };
  }
}

export async function rewriteArticle(
  sources: { title: string, content: string, source_name: string }[],
  overrideConfig?: AIOverrideConfig
) {
  const isMultiSource = sources.length > 1;
  const sourcesText = sources.map(s => `[${s.source_name}]: ${s.content}`).join('\n\n---\n\n');

  const prompt = `
Tu es journaliste tech senior pour Nexus. Réécris cette actualité en français.

${isMultiSource ? 'SOURCES MULTIPLES (compile les informations uniques):' : 'SOURCE UNIQUE:'}
${sourcesText}

EXIGENCES:
1. TITRE: Accrocheur, factuel, en français.
2. CONTENU: 3-4 paragraphes. Contexte, faits, analyse. Pas de jargon inutile.
3. TON: Professionnel, neutre, précis. Inspiré du NYT/Les Échos.
5. CATEGORIE: Choisis LA plus pertinente dans cette liste exacte :
   [IA, Hardware, Software, Cyber-Sécurité, Startups, Business, Dev, Science, Mobile, Gaming, Cloud, FinTech, Social, GreenTech, Spatial, Télécom, General]

FORMAT JSON:
{
  "title": "Titre en français",
  "content": "L'article complet réécrit...",
  "tldr": "Résumé en 2 phrases maximum.",
  "impact": "Pourquoi c'est important (1 phrase).",
  "category": "Categorie_Choisie"
}`;

  try {
    const response = await createChatCompletion({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    }, overrideConfig, 'smart'); // Rewriting = High Quality
    return JSON.parse(response.choices[0].message.content || '{}');
  } catch (error) {
    console.error('Rewrite Error:', error);
    return null;
  }
}

export async function generateEmbedding(text: string) {
  if (!getGenAI()) return null;
  const model = getGenAI()!.getGenerativeModel({ model: "text-embedding-004" });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

export async function generateDailyDigest(articles: any[], overrideConfig?: AIOverrideConfig) {
  const articlesText = articles.map(a => `- ${a.title}`).join('\n');
  const prompt = `Rédige le Digest Nexus du jour. 5 points clés. JSON: {"title": "...", "intro": "...", "essentials": ["..."]}. Articles: ${articlesText}`;
  try {
    const response = await createChatCompletion({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    }, overrideConfig, 'smart');
    return JSON.parse(response.choices[0].message.content || '{}');
  } catch (error) {
    return null;
  }
}
