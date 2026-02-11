import type { SupabaseClient } from '@supabase/supabase-js';
import type { AIOverrideConfig } from '../ai';
import type { ProcessResult } from './types';

export interface ProcessPublicationConfig {
  publishThreshold: number;
  minSources: number;
  freshOnly: boolean;
  freshnessCutoff: string;
  ignoreMaturity: boolean;
  maturityHours: number;
}

export interface ProcessExecutionContext {
  supabase: SupabaseClient;
  effectiveConfig: AIOverrideConfig;
  pubConfig: ProcessPublicationConfig;
  processingLimit: number;
  llmDelayMs: number;
  results: ProcessResult['processed'];
  log: (message: string) => void;
  shouldStop: () => Promise<boolean>;
  updateProgress: (current: number, total: number, label?: string) => Promise<void>;
  sleep: (ms: number) => Promise<void>;
  isTimeSafelyRemaining: () => boolean;
}
