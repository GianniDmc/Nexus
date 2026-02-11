import { getServiceSupabase } from '../supabase-admin';
import { type AIOverrideConfig } from '../ai';
import { startProcessing, shouldStopProcessing, finishProcessing, updateProgress } from '../processing-state';
import { getPublicationConfig } from '../publication-rules';
import { resolveProcessExecutionPolicy } from './execution-policy';
import { runEmbeddingStep } from './steps/embedding-step';
import { runClusteringStep } from './steps/clustering-step';
import { runScoringStep } from './steps/scoring-step';
import { runRewritingStep } from './steps/rewriting-step';
import type { ProcessExecutionContext } from './process-context';
import type { ProcessOptions, ProcessResult, ProcessStep } from './types';

export type { ProcessStep, ProcessOptions, ProcessResult } from './types';

function resolveEffectiveAiConfig(config?: AIOverrideConfig): AIOverrideConfig {
  const envPaidGoogle = process.env.PAID_GOOGLE_API_KEY;
  const envPaidOpenAI = process.env.PAID_OPENAI_API_KEY;
  const envPaidAnthropic = process.env.PAID_ANTHROPIC_API_KEY;

  return {
    ...config,
    openaiKey: config?.openaiKey || envPaidOpenAI,
    anthropicKey: config?.anthropicKey || envPaidAnthropic,
    geminiKey: config?.geminiKey || envPaidGoogle,
    preferredProvider: config?.preferredProvider || (envPaidOpenAI ? 'openai' : envPaidAnthropic ? 'anthropic' : 'auto'),
  };
}

export async function runProcess(options: ProcessOptions = {}): Promise<ProcessResult> {
  const supabase = getServiceSupabase();
  const log = options.log || console.log;
  const step: ProcessStep = options.step || 'all';
  const pubConfig = getPublicationConfig(options.publicationOverrides);
  const effectiveConfig = resolveEffectiveAiConfig(options.config);
  const hasPaidKey = !!(effectiveConfig.openaiKey || effectiveConfig.anthropicKey || effectiveConfig.geminiKey);

  const executionPolicy = resolveProcessExecutionPolicy({
    profile: options.executionProfile,
    hasPaidKey,
    overrides: {
      maxExecutionMs: options.maxExecutionMs,
      useProcessingState: options.useProcessingState,
      processingLimit: options.processingLimit,
      llmDelayMs: options.llmDelayMs,
    },
  });

  const results: ProcessResult['processed'] = {
    embeddings: 0,
    clustered: 0,
    scored: 0,
    rewritten: 0,
    batches: 0,
    stopped: false,
  };

  const useProcessingState = executionPolicy.useProcessingState;
  const maxExecutionMs = executionPolicy.maxExecutionMs;
  const runId = crypto.randomUUID();
  let lockAcquired = false;

  const safeShouldStop = async () => {
    if (!useProcessingState) return false;
    return shouldStopProcessing();
  };

  const safeUpdateProgress = async (current: number, total: number, label?: string) => {
    if (!useProcessingState) return;
    await updateProgress(current, total, label);
  };

  if (useProcessingState) {
    const canStart = await startProcessing(step, runId);
    if (!canStart) {
      return {
        success: true,
        step,
        processed: { ...results, stopped: true },
      };
    }
    lockAcquired = true;
  }

  const { processingLimit, llmDelayMs } = executionPolicy;
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  const startTime = Date.now();
  const isTimeSafelyRemaining = () => Date.now() - startTime < maxExecutionMs;

  const context: ProcessExecutionContext = {
    supabase,
    effectiveConfig,
    pubConfig,
    processingLimit,
    llmDelayMs,
    results,
    log,
    shouldStop: safeShouldStop,
    updateProgress: safeUpdateProgress,
    sleep,
    isTimeSafelyRemaining,
  };

  try {
    if ((step === 'embedding' || step === 'all') && isTimeSafelyRemaining() && !results.stopped) {
      await runEmbeddingStep(context);
    }

    if ((step === 'clustering' || step === 'all') && isTimeSafelyRemaining() && !results.stopped) {
      await runClusteringStep(context);
    }

    if ((step === 'scoring' || step === 'all') && isTimeSafelyRemaining() && !results.stopped) {
      await runScoringStep(context);
    }

    if ((step === 'rewriting' || step === 'all') && isTimeSafelyRemaining() && !results.stopped) {
      await runRewritingStep(context);
    }

    return {
      success: true,
      step,
      processed: results,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('429') || message.toLowerCase().includes('rate limit')) {
      return { success: false, error: message, retryAfter: 30, step, processed: results };
    }
    return { success: false, error: message, step, processed: results };
  } finally {
    if (useProcessingState && lockAcquired) {
      await finishProcessing(runId);
    }
  }
}
