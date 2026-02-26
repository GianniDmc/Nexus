import type { AIOverrideConfig } from '../ai';
import type { PublicationOverrides } from '../publication-rules';
import type { ExecutionProfile } from './execution-policy';

export type ProcessStep = 'embedding' | 'clustering' | 'scoring' | 'rewriting' | 'all';

export interface ProcessOptions {
  step?: ProcessStep;
  config?: AIOverrideConfig;
  executionProfile?: ExecutionProfile;
  publicationOverrides?: PublicationOverrides;
  maxExecutionMs?: number;
  useProcessingState?: boolean;
  processingLimit?: number;
  llmDelayMs?: number;
  log?: (message: string) => void;
}

export interface ProcessResult {
  success: boolean;
  step: ProcessStep;
  elapsedMs?: number;
  processed: {
    embeddings: number;
    clustered: number;
    scored: number;
    rewritten: number;
    batches: number;
    stopped: boolean;
  };
  error?: string;
  retryAfter?: number;
}
