export const EXECUTION_PROFILES = ['api', 'manual', 'refresh', 'gha'] as const;
export type ExecutionProfile = (typeof EXECUTION_PROFILES)[number];

const DEFAULT_EXECUTION_PROFILE: ExecutionProfile = 'api';

type ProcessProfileDefaults = {
  maxExecutionMs: number;
  useProcessingState: boolean;
  processingLimitFree: number;
  processingLimitPaid: number;
  llmDelayFreeMs: number;
  llmDelayPaidMs: number;
};

type IngestProfileDefaults = {
  batchSize: number;
  batchDelayMs: number;
  sourceConcurrency: number;
  sourceTimeoutMs: number;
  retrySourceTimeoutMs: number;
};

export interface ProcessExecutionOverrides {
  maxExecutionMs?: number;
  useProcessingState?: boolean;
  processingLimit?: number;
  llmDelayMs?: number;
}

export interface IngestExecutionOverrides {
  batchSize?: number;
  batchDelayMs?: number;
  sourceConcurrency?: number;
  sourceTimeoutMs?: number;
  retrySourceTimeoutMs?: number;
}

export interface ResolvedProcessExecutionPolicy {
  profile: ExecutionProfile;
  maxExecutionMs: number;
  useProcessingState: boolean;
  processingLimit: number;
  llmDelayMs: number;
  throughputMode: 'free' | 'paid';
}

export interface ResolvedIngestExecutionPolicy {
  profile: ExecutionProfile;
  batchSize: number;
  batchDelayMs: number;
  sourceConcurrency: number;
  sourceTimeoutMs: number;
  retrySourceTimeoutMs: number;
}

const PROCESS_PROFILE_DEFAULTS: Record<ExecutionProfile, ProcessProfileDefaults> = {
  api: {
    maxExecutionMs: 120000,
    useProcessingState: true,
    processingLimitFree: 8,
    processingLimitPaid: 24,
    llmDelayFreeMs: 3000,
    llmDelayPaidMs: 250,
  },
  manual: {
    maxExecutionMs: 360000,
    useProcessingState: true,
    processingLimitFree: 12,
    processingLimitPaid: 45,
    llmDelayFreeMs: 2000,
    llmDelayPaidMs: 120,
  },
  refresh: {
    maxExecutionMs: 75000,
    useProcessingState: true,
    processingLimitFree: 8,
    processingLimitPaid: 20,
    llmDelayFreeMs: 2500,
    llmDelayPaidMs: 200,
  },
  gha: {
    maxExecutionMs: 1080000,
    useProcessingState: true,
    processingLimitFree: 24,
    processingLimitPaid: 100,
    llmDelayFreeMs: 900,
    llmDelayPaidMs: 60,
  },
};

const INGEST_PROFILE_DEFAULTS: Record<ExecutionProfile, IngestProfileDefaults> = {
  api: {
    batchSize: 8,
    batchDelayMs: 250,
    sourceConcurrency: 6,
    sourceTimeoutMs: 9000,
    retrySourceTimeoutMs: 8000,
  },
  manual: {
    batchSize: 12,
    batchDelayMs: 120,
    sourceConcurrency: 8,
    sourceTimeoutMs: 10000,
    retrySourceTimeoutMs: 9000,
  },
  refresh: {
    batchSize: 6,
    batchDelayMs: 300,
    sourceConcurrency: 4,
    sourceTimeoutMs: 7000,
    retrySourceTimeoutMs: 6000,
  },
  gha: {
    batchSize: 24,
    batchDelayMs: 40,
    sourceConcurrency: 14,
    sourceTimeoutMs: 15000,
    retrySourceTimeoutMs: 12000,
  },
};

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value), min), max);
}

export function sanitizeExecutionProfile(
  value: string | null | undefined,
  fallback: ExecutionProfile = DEFAULT_EXECUTION_PROFILE
): ExecutionProfile {
  if (!value) return fallback;
  return (EXECUTION_PROFILES as readonly string[]).includes(value) ? (value as ExecutionProfile) : fallback;
}

export function resolveProcessExecutionPolicy(input: {
  profile?: ExecutionProfile;
  hasPaidKey: boolean;
  overrides?: ProcessExecutionOverrides;
}): ResolvedProcessExecutionPolicy {
  const profile = input.profile || DEFAULT_EXECUTION_PROFILE;
  const defaults = PROCESS_PROFILE_DEFAULTS[profile];
  const overrides = input.overrides || {};
  const throughputMode = input.hasPaidKey ? 'paid' : 'free';

  const defaultProcessingLimit =
    throughputMode === 'paid' ? defaults.processingLimitPaid : defaults.processingLimitFree;
  const defaultLlmDelayMs =
    throughputMode === 'paid' ? defaults.llmDelayPaidMs : defaults.llmDelayFreeMs;

  return {
    profile,
    throughputMode,
    maxExecutionMs: clampInt(overrides.maxExecutionMs, defaults.maxExecutionMs, 10000, 3_600_000),
    useProcessingState:
      typeof overrides.useProcessingState === 'boolean'
        ? overrides.useProcessingState
        : defaults.useProcessingState,
    processingLimit: clampInt(overrides.processingLimit, defaultProcessingLimit, 1, 500),
    llmDelayMs: clampInt(overrides.llmDelayMs, defaultLlmDelayMs, 0, 30_000),
  };
}

export function resolveIngestExecutionPolicy(input: {
  profile?: ExecutionProfile;
  overrides?: IngestExecutionOverrides;
}): ResolvedIngestExecutionPolicy {
  const profile = input.profile || DEFAULT_EXECUTION_PROFILE;
  const defaults = INGEST_PROFILE_DEFAULTS[profile];
  const overrides = input.overrides || {};

  return {
    profile,
    batchSize: clampInt(overrides.batchSize, defaults.batchSize, 1, 200),
    batchDelayMs: clampInt(overrides.batchDelayMs, defaults.batchDelayMs, 0, 10_000),
    sourceConcurrency: clampInt(overrides.sourceConcurrency, defaults.sourceConcurrency, 1, 100),
    sourceTimeoutMs: clampInt(overrides.sourceTimeoutMs, defaults.sourceTimeoutMs, 1000, 120_000),
    retrySourceTimeoutMs: clampInt(overrides.retrySourceTimeoutMs, defaults.retrySourceTimeoutMs, 1000, 120_000),
  };
}
