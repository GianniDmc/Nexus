import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
import { getModelRoutingStrategy, type ModelTier, type ProviderName } from './ai-model-strategy';
import { SCORING_CONFIG, computeWeightedScore, type ScoringDetails } from './scoring-config';

// Lazy initialization for Groq to ensure env vars are loaded
let _groq: OpenAI | null = null;
const getGroq = () => {
  if (!_groq && process.env.GROQ_API_KEY) {
    _groq = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
    });
  }
  return _groq;
};

// Lazy initialization for Gemini to ensure env vars are loaded
let _genAI: GoogleGenerativeAI | null = null;
const getGenAI = () => {
  const envKey = process.env.PAID_GOOGLE_API_KEY || process.env.GOOGLE_API_KEY;
  if (!_genAI && envKey) {
    _genAI = new GoogleGenerativeAI(envKey);
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
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const jitter = (max: number) => Math.floor(Math.random() * max);

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

const toShortErrorMessage = (message: string) =>
  message.includes(']')
    ? message.substring(message.lastIndexOf(']') + 2, message.lastIndexOf(']') + 82)
    : message.substring(0, 80);

const shouldRetrySameModel = (message: string): boolean => {
  const lowered = message.toLowerCase();
  if (lowered.includes('404')) return false;
  if (lowered.includes('not found')) return false;
  if (lowered.includes('does not exist')) return false;
  if (lowered.includes('unsupported')) return false;
  if (lowered.includes('permission denied')) return false;
  if (lowered.includes('insufficient permissions')) return false;
  return true;
};

const getProviderOrder = (
  preferredProvider: AIOverrideConfig['preferredProvider'],
  strategy: ReturnType<typeof getModelRoutingStrategy>
): ProviderName[] => {
  if (preferredProvider === 'openai' || preferredProvider === 'anthropic' || preferredProvider === 'gemini') {
    return strategy.preferredProviderFallbackOrder[preferredProvider];
  }
  return strategy.autoProviderOrder;
};

type ChatPayload = Omit<OpenAI.Chat.Completions.ChatCompletionCreateParams, 'stream'> & { stream?: false };
type NormalizedChatCompletion = { choices: Array<{ message: { content: string } }> };

const normalizeText = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part) {
          const maybeText = (part as { text?: unknown }).text;
          return typeof maybeText === 'string' ? maybeText : '';
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return '';
};

const createChatCompletion = async (
  payload: ChatPayload,
  overrideConfig?: AIOverrideConfig,
  modelTier: ModelTier = 'smart'
): Promise<NormalizedChatCompletion> => {
  const strategy = getModelRoutingStrategy();
  let lastError: unknown;
  const providerOrder = getProviderOrder(overrideConfig?.preferredProvider || 'auto', strategy);

  const getPrompt = () => {
    if (Array.isArray(payload.messages)) {
      return payload.messages
        .map((message) => {
          const role = typeof message.role === 'string' ? message.role : 'user';
          const content = normalizeText((message as { content?: unknown }).content);
          return `${role === 'user' ? '' : '[System/Context]: '}${content}`;
        })
        .join('\n');
    }
    return "Requete: " + JSON.stringify(payload);
  };

  const prompt = getPrompt();

  for (const provider of providerOrder) {
    if (provider === 'openai' && overrideConfig?.openaiKey) {
      const client = new OpenAI({ apiKey: overrideConfig.openaiKey });
      for (const model of strategy.openai[modelTier]) {
        for (let attempt = 0; attempt < strategy.maxAttemptsPerModel; attempt += 1) {
          try {
            const result = await client.chat.completions.create({
              ...payload,
              model,
              stream: false
            });
            console.log(`[LLM] ✅ OpenAI/${model} (${modelTier}) — (user paid key)${attempt > 0 ? ` (retry ${attempt})` : ''}`);
            return { choices: [{ message: { content: normalizeText(result.choices[0]?.message?.content) } }] };
          } catch (error: unknown) {
            lastError = error;
            const message = getErrorMessage(error);
            const shortMessage = toShortErrorMessage(message);
            console.warn(
              `[LLM] ⚠️ OpenAI/${model} attempt ${attempt + 1}/${strategy.maxAttemptsPerModel} failed: ${shortMessage}`
            );
            const hasNextRetry = attempt < strategy.maxAttemptsPerModel - 1 && shouldRetrySameModel(message);
            if (hasNextRetry) {
              const delay = strategy.baseRetryDelayMs * Math.pow(2, attempt) + jitter(250);
              await sleep(delay);
            } else {
              break;
            }
          }
        }
      }
    }

    if (provider === 'anthropic' && overrideConfig?.anthropicKey) {
      const client = new Anthropic({ apiKey: overrideConfig.anthropicKey });
      for (const model of strategy.anthropic[modelTier]) {
        for (let attempt = 0; attempt < strategy.maxAttemptsPerModel; attempt += 1) {
          try {
            const response = await client.messages.create({
              model,
              max_tokens: 4096,
              messages: [{ role: 'user', content: prompt }]
            });
            const text = response.content[0].type === 'text' ? response.content[0].text : '';
            console.log(
              `[LLM] ✅ Anthropic/${model} (${modelTier}) — (user paid key)${attempt > 0 ? ` (retry ${attempt})` : ''}`
            );
            return { choices: [{ message: { content: text } }] };
          } catch (error: unknown) {
            lastError = error;
            const message = getErrorMessage(error);
            const shortMessage = toShortErrorMessage(message);
            console.warn(
              `[LLM] ⚠️ Anthropic/${model} attempt ${attempt + 1}/${strategy.maxAttemptsPerModel} failed: ${shortMessage}`
            );
            const hasNextRetry = attempt < strategy.maxAttemptsPerModel - 1 && shouldRetrySameModel(message);
            if (hasNextRetry) {
              const delay = strategy.baseRetryDelayMs * Math.pow(2, attempt) + jitter(250);
              await sleep(delay);
            } else {
              break;
            }
          }
        }
      }
    }

    if (provider === 'gemini') {
      const geminiEnvPaid = process.env.PAID_GOOGLE_API_KEY;
      const geminiEnvFree = process.env.GOOGLE_API_KEY;
      const geminiKey = overrideConfig?.geminiKey || geminiEnvPaid || geminiEnvFree;
      if (!geminiKey) continue;

      const keySource = overrideConfig?.geminiKey ? '(user paid key)' : (geminiEnvPaid ? '(env paid key)' : '(env free key)');
      const genAI = overrideConfig?.geminiKey ? new GoogleGenerativeAI(overrideConfig.geminiKey) : getGenAI();
      if (!genAI) continue;

      for (const model of strategy.gemini[modelTier]) {
        for (let attempt = 0; attempt < strategy.maxAttemptsPerModel; attempt += 1) {
          try {
            const generationConfig: Record<string, unknown> = {
              responseMimeType: payload.response_format?.type === 'json_object' ? 'application/json' : 'text/plain'
            };
            if (typeof payload.temperature === 'number') generationConfig.temperature = payload.temperature;
            if (typeof payload.max_tokens === 'number') generationConfig.maxOutputTokens = payload.max_tokens;

            const geminiModel = genAI.getGenerativeModel({ model, generationConfig });
            const result = await geminiModel.generateContent(prompt);
            console.log(`[LLM] ✅ Gemini/${model} (${modelTier}) — ${keySource}${attempt > 0 ? ` (retry ${attempt})` : ''}`);
            return { choices: [{ message: { content: result.response.text() } }] };
          } catch (error: unknown) {
            lastError = error;
            const message = getErrorMessage(error);
            const shortMessage = toShortErrorMessage(message);
            console.warn(
              `[LLM] ⚠️ Gemini/${model} attempt ${attempt + 1}/${strategy.maxAttemptsPerModel} failed: ${shortMessage}`
            );
            const hasNextRetry = attempt < strategy.maxAttemptsPerModel - 1 && shouldRetrySameModel(message);
            if (hasNextRetry) {
              const delay = strategy.baseRetryDelayMs * Math.pow(2, attempt) + jitter(250);
              await sleep(delay);
            } else {
              break;
            }
          }
        }
      }
    }

    if (provider === 'groq') {
      const groqClient = getGroq();
      if (!groqClient) continue;
      for (const model of strategy.groq[modelTier]) {
        for (let attempt = 0; attempt < strategy.maxAttemptsPerModel; attempt += 1) {
          try {
            const result = await groqClient.chat.completions.create({
              ...payload,
              model,
              stream: false
            });
            console.log(`[LLM] ✅ Groq/${model} (${modelTier}) — fallback${attempt > 0 ? ` (retry ${attempt})` : ''}`);
            return { choices: [{ message: { content: normalizeText(result.choices[0]?.message?.content) } }] };
          } catch (error: unknown) {
            lastError = error;
            const message = getErrorMessage(error);
            const shortMessage = toShortErrorMessage(message);
            console.warn(
              `[LLM] ⚠️ Groq/${model} attempt ${attempt + 1}/${strategy.maxAttemptsPerModel} failed: ${shortMessage}`
            );
            const hasNextRetry = attempt < strategy.maxAttemptsPerModel - 1 && shouldRetrySameModel(message);
            if (hasNextRetry) {
              const delay = strategy.baseRetryDelayMs * Math.pow(2, attempt) + jitter(250);
              await sleep(delay);
            } else {
              break;
            }
          }
        }
      }
    }
  }

  console.error('[LLM] ❌ All providers failed');
  throw lastError;
};

export async function scoreCluster(
  articles: { id: string; title: string; content: string; source_name: string; published_at?: string | null }[],
  overrideConfig?: AIOverrideConfig
): Promise<{ score: number; representative_id: string | null; details: ScoringDetails | null }> {
  if (articles.length === 0) return { score: 0, representative_id: null, details: null };

  // Méta-données enrichies
  const uniqueSources = new Set(articles.map(a => a.source_name));
  const dates = articles
    .map(a => a.published_at ? new Date(a.published_at) : null)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());
  const dateRange = dates.length >= 2
    ? `du ${dates[0].toISOString().slice(0, 10)} au ${dates[dates.length - 1].toISOString().slice(0, 10)}`
    : dates.length === 1
      ? dates[0].toISOString().slice(0, 10)
      : 'dates inconnues';

  const articlesText = articles.map(a => {
    const datePart = a.published_at ? `\nDATE: ${new Date(a.published_at).toISOString().slice(0, 16)}` : '';
    return `ID: ${a.id}\nSOURCE: ${a.source_name}${datePart}\nTITRE: ${a.title}\nEXTRAIT: ${a.content?.substring(0, SCORING_CONFIG.excerptLength)}`;
  }).join('\n\n---\n\n');

  const prompt = `Tu es un rédacteur en chef Tech. Évalue ce SUJET d'actualité (cluster de ${articles.length} articles, ${uniqueSources.size} sources distinctes, période : ${dateRange}).

Donne 3 sous-scores de 0 à 10 :
- **impact** : Est-ce une news majeure qui affecte l'industrie, ou anecdotique ?
- **tech_relevance** : Est-ce pertinent pour une veille technologique ? (Politique/Fait divers sans lien tech = 0)
- **originality** : Le sujet apporte-t-il un angle nouveau, une info exclusive, ou est-ce du réchauffé déjà largement couvert ?

Exemples de calibration :
- Score ~3 : "Une entreprise met à jour son app avec des corrections mineures" → impact 2, tech_relevance 4, originality 2
- Score ~9 : "OpenAI lance un nouveau modèle qui surpasse tous les benchmarks existants" → impact 10, tech_relevance 9, originality 8

Identifie aussi l'ID de l'article le plus complet/informatif (representative_id).

Articles du cluster :
${articlesText}

Raisonne brièvement (2-3 phrases dans "reasoning") PUIS donne tes scores.
Réponds UNIQUEMENT un JSON :
{
  "reasoning": "...",
  "impact": <0-10>,
  "tech_relevance": <0-10>,
  "originality": <0-10>,
  "representative_id": "uuid_string"
}`;

  try {
    console.log(`[LLM] 🎯 Cluster scoring (${articles.length} articles, ${uniqueSources.size} sources)`);
    const response = await createChatCompletion({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' }
    }, overrideConfig, 'fast');

    const result = JSON.parse(response.choices[0].message.content || '{}');

    const subscores = {
      impact: typeof result.impact === 'number' ? Math.min(10, Math.max(0, result.impact)) : 0,
      tech_relevance: typeof result.tech_relevance === 'number' ? Math.min(10, Math.max(0, result.tech_relevance)) : 0,
      originality: typeof result.originality === 'number' ? Math.min(10, Math.max(0, result.originality)) : 0,
    };
    const weightedScore = computeWeightedScore(subscores);

    const details: ScoringDetails = {
      version: SCORING_CONFIG.version,
      reasoning: typeof result.reasoning === 'string' ? result.reasoning : '',
      subscores,
      weighted_score: weightedScore,
    };

    return {
      score: weightedScore,
      representative_id: result.representative_id || articles[0].id,
      details,
    };
  } catch (error) {
    console.error("Cluster Scoring Failed:", error);
    return { score: 0, representative_id: articles.length > 0 ? articles[0].id : null, details: null };
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
    console.log(`[LLM] 🎯 Rewriting (${sources.length} sources)`);
    const response = await createChatCompletion({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    }, overrideConfig, 'smart');
    return JSON.parse(response.choices[0].message.content || '{}');
  } catch (error) {
    console.error('Rewrite Error:', error);
    return null;
  }
}

export async function generateEmbedding(text: string, apiKey?: string) {
  const strategy = getModelRoutingStrategy();
  const embeddingModels = strategy.geminiEmbedding;
  const keySource = apiKey ? '(user paid key)' : (process.env.PAID_GOOGLE_API_KEY ? '(env paid key)' : '(env free key)');

  console.log(`[LLM] 🎯 Embedding generation`);

  for (const embeddingModel of embeddingModels) {
    for (let attempt = 0; attempt < strategy.maxAttemptsPerModel; attempt += 1) {
      try {
        let model;
        if (apiKey) {
          const genAI = new GoogleGenerativeAI(apiKey);
          model = genAI.getGenerativeModel({ model: `models/${embeddingModel}` });
        } else {
          if (!getGenAI()) return null;
          model = getGenAI()!.getGenerativeModel({ model: `models/${embeddingModel}` });
        }

        const embeddingRequest = {
          content: { role: 'user', parts: [{ text }] },
          outputDimensionality: 768
        } as unknown as Parameters<typeof model.embedContent>[0];

        const result = await model.embedContent(embeddingRequest);

        console.log(`[LLM] ✅ Gemini/${embeddingModel} — ${keySource}${attempt > 0 ? ` (retry ${attempt})` : ''}`);
        return result.embedding.values;
      } catch (error: unknown) {
        const message = getErrorMessage(error);
        const shortMessage = toShortErrorMessage(message);
        console.warn(
          `[LLM] ⚠️ Gemini/${embeddingModel} attempt ${attempt + 1}/${strategy.maxAttemptsPerModel} failed: ${shortMessage}`
        );
        const hasNextRetry = attempt < strategy.maxAttemptsPerModel - 1 && shouldRetrySameModel(message);
        if (hasNextRetry) {
          const delay = strategy.baseRetryDelayMs * Math.pow(2, attempt) + jitter(250);
          await sleep(delay);
        } else {
          break;
        }
      }
    }
  }

  console.error('[LLM] ❌ Embedding generation failed completely');
  return null;
}
