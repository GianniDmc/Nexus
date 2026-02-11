import { existsSync } from 'fs';
import { config } from 'dotenv';

// Only load .env.local if it exists (local dev). In CI, env vars are injected directly.
if (existsSync('.env.local')) {
  config({ path: '.env.local' });
}

import { runIngest } from '../src/lib/pipeline/ingest';

const toNumber = (value?: string) => {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

async function main() {
  const result = await runIngest({
    executionProfile: 'gha',
    sourceFilter: process.env.SOURCE_FILTER || undefined,
    batchSize: toNumber(process.env.BATCH_SIZE),
    batchDelayMs: toNumber(process.env.BATCH_DELAY_MS),
    sourceConcurrency: toNumber(process.env.SOURCE_CONCURRENCY),
    sourceTimeoutMs: toNumber(process.env.SOURCE_TIMEOUT_MS),
    retrySourceTimeoutMs: toNumber(process.env.RETRY_SOURCE_TIMEOUT_MS),
  });

  console.log(JSON.stringify(result));

  if (!result.success) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[CRON INGEST] Unhandled error:', error);
  process.exitCode = 1;
});
