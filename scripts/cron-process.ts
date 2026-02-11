import { existsSync } from 'fs';
import { config } from 'dotenv';

// Only load .env.local if it exists (local dev). In CI, env vars are injected directly.
if (existsSync('.env.local')) {
  config({ path: '.env.local' });
}

import { runProcess, type ProcessStep } from '../src/lib/pipeline/process';
import type { AIOverrideConfig } from '../src/lib/ai';
import type { PublicationOverrides } from '../src/lib/publication-rules';

const toNumber = (value?: string) => {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toBool = (value?: string) => {
  if (!value) return undefined;
  return value === 'true' || value === '1';
};

async function main() {
  const step = (process.env.PROCESS_STEP as ProcessStep) || 'all';
  const maxExecutionMs = toNumber(process.env.MAX_EXECUTION_MS) ?? (18 * 60 * 1000);

  const publicationOverrides: PublicationOverrides = {
    publishThreshold: toNumber(process.env.PUBLISH_THRESHOLD),
    minSources: toNumber(process.env.MIN_SOURCES),
    freshOnly: toBool(process.env.FRESH_ONLY),
    ignoreMaturity: toBool(process.env.IGNORE_MATURITY),
  };

  const preferredProvider = process.env.PREFERRED_PROVIDER as AIOverrideConfig['preferredProvider'] | undefined;
  const config: AIOverrideConfig | undefined = preferredProvider ? { preferredProvider } : undefined;

  const result = await runProcess({
    step,
    config,
    executionProfile: 'gha',
    publicationOverrides,
    maxExecutionMs: toNumber(process.env.MAX_EXECUTION_MS) !== undefined ? maxExecutionMs : undefined,
    useProcessingState: process.env.USE_PROCESSING_STATE !== 'false',
  });

  console.log(JSON.stringify(result));

  if (!result.success) {
    if (result.retryAfter) {
      console.warn(`[CRON PROCESS] Rate limited. retryAfter=${result.retryAfter}s`);
      return;
    }
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[CRON PROCESS] Unhandled error:', error);
  process.exitCode = 1;
});
