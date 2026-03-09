export type ModelTier = 'fast' | 'smart';
export type ProviderName = 'openai' | 'anthropic' | 'gemini' | 'groq';

type ProviderModelConfig = Record<ModelTier, string[]>;

export interface ModelRoutingStrategy {
  openai: ProviderModelConfig;
  anthropic: ProviderModelConfig;
  gemini: ProviderModelConfig;
  groq: ProviderModelConfig;
  geminiEmbedding: string[];
  autoProviderOrder: ProviderName[];
  preferredProviderFallbackOrder: Record<'openai' | 'anthropic' | 'gemini', ProviderName[]>;
  maxAttemptsPerModel: number;
  baseRetryDelayMs: number;
}

const VALID_PROVIDERS: ProviderName[] = ['openai', 'anthropic', 'gemini', 'groq'];

const DEFAULT_OPENAI_MODELS: ProviderModelConfig = {
  fast: ['gpt-5-mini'],
  smart: ['gpt-5.2'],
};

const DEFAULT_ANTHROPIC_MODELS: ProviderModelConfig = {
  fast: ['claude-haiku-4-5'],
  smart: ['claude-sonnet-4-5-20250929'],
};

const DEFAULT_GEMINI_MODELS: ProviderModelConfig = {
  fast: [
    'gemini-3.1-flash-lite-preview',
    'gemini-3-flash-preview',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
  ],
  smart: [
    'gemini-3-flash-preview',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
  ],
};

const DEFAULT_GROQ_MODELS: ProviderModelConfig = {
  fast: ['llama-3.3-70b-versatile'],
  smart: ['llama-3.3-70b-versatile'],
};

const DEFAULT_GEMINI_EMBEDDING_MODELS = ['gemini-embedding-001'];

const DEFAULT_AUTO_PROVIDER_ORDER: ProviderName[] = ['gemini', 'openai', 'anthropic', 'groq'];

const DEFAULT_PREFERRED_PROVIDER_FALLBACK_ORDER: Record<'openai' | 'anthropic' | 'gemini', ProviderName[]> = {
  openai: ['openai', 'anthropic', 'gemini', 'groq'],
  anthropic: ['anthropic', 'openai', 'gemini', 'groq'],
  gemini: ['gemini', 'openai', 'anthropic', 'groq'],
};

const DEFAULT_MAX_ATTEMPTS_PER_MODEL = 3;
const DEFAULT_BASE_RETRY_DELAY_MS = 1200;

function parseStringList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parseModelList(value: string | undefined, fallback: string[]): string[] {
  const parsed = parseStringList(value);
  return parsed.length > 0 ? parsed : fallback;
}

function parseProviderOrder(value: string | undefined, fallback: ProviderName[]): ProviderName[] {
  const parsed = parseStringList(value).filter((item): item is ProviderName =>
    (VALID_PROVIDERS as string[]).includes(item)
  );
  if (parsed.length === 0) return fallback;

  const unique: ProviderName[] = [];
  for (const provider of parsed) {
    if (!unique.includes(provider)) unique.push(provider);
  }

  for (const provider of VALID_PROVIDERS) {
    if (!unique.includes(provider)) unique.push(provider);
  }

  return unique;
}

function parsePositiveInt(value: string | undefined, fallback: number, min: number, max: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export function getModelRoutingStrategy(): ModelRoutingStrategy {
  const openai: ProviderModelConfig = {
    fast: parseModelList(process.env.LLM_OPENAI_FAST_MODELS, DEFAULT_OPENAI_MODELS.fast),
    smart: parseModelList(process.env.LLM_OPENAI_SMART_MODELS, DEFAULT_OPENAI_MODELS.smart),
  };

  const anthropic: ProviderModelConfig = {
    fast: parseModelList(process.env.LLM_ANTHROPIC_FAST_MODELS, DEFAULT_ANTHROPIC_MODELS.fast),
    smart: parseModelList(process.env.LLM_ANTHROPIC_SMART_MODELS, DEFAULT_ANTHROPIC_MODELS.smart),
  };

  const geminiSmartFallbacks = [...DEFAULT_GEMINI_MODELS.smart];
  if (String(process.env.GEMINI_ENABLE_PRO_FALLBACK || '').toLowerCase() === 'true') {
    geminiSmartFallbacks.push('gemini-3.1-pro-preview', 'gemini-2.5-pro');
  }

  const gemini: ProviderModelConfig = {
    fast: parseModelList(process.env.LLM_GEMINI_FAST_MODELS, DEFAULT_GEMINI_MODELS.fast),
    smart: parseModelList(process.env.LLM_GEMINI_SMART_MODELS, geminiSmartFallbacks),
  };

  const groq: ProviderModelConfig = {
    fast: parseModelList(process.env.LLM_GROQ_FAST_MODELS, DEFAULT_GROQ_MODELS.fast),
    smart: parseModelList(process.env.LLM_GROQ_SMART_MODELS, DEFAULT_GROQ_MODELS.smart),
  };

  const geminiEmbedding = parseModelList(process.env.LLM_GEMINI_EMBEDDING_MODELS, DEFAULT_GEMINI_EMBEDDING_MODELS);

  return {
    openai,
    anthropic,
    gemini,
    groq,
    geminiEmbedding,
    autoProviderOrder: parseProviderOrder(process.env.LLM_AUTO_PROVIDER_ORDER, DEFAULT_AUTO_PROVIDER_ORDER),
    preferredProviderFallbackOrder: {
      openai: parseProviderOrder(process.env.LLM_OPENAI_PROVIDER_ORDER, DEFAULT_PREFERRED_PROVIDER_FALLBACK_ORDER.openai),
      anthropic: parseProviderOrder(
        process.env.LLM_ANTHROPIC_PROVIDER_ORDER,
        DEFAULT_PREFERRED_PROVIDER_FALLBACK_ORDER.anthropic
      ),
      gemini: parseProviderOrder(process.env.LLM_GEMINI_PROVIDER_ORDER, DEFAULT_PREFERRED_PROVIDER_FALLBACK_ORDER.gemini),
    },
    maxAttemptsPerModel: parsePositiveInt(
      process.env.LLM_MAX_ATTEMPTS_PER_MODEL,
      DEFAULT_MAX_ATTEMPTS_PER_MODEL,
      1,
      5
    ),
    baseRetryDelayMs: parsePositiveInt(process.env.LLM_BASE_RETRY_DELAY_MS, DEFAULT_BASE_RETRY_DELAY_MS, 100, 10000),
  };
}

export function getGeminiHealthcheckModel(): string {
  const strategy = getModelRoutingStrategy();
  return strategy.gemini.fast[0] || 'gemini-3.1-flash-lite-preview';
}
