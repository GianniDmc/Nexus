import { NextRequest, NextResponse } from 'next/server';
import { runProcess, type ProcessStep } from '@/lib/pipeline/process';
import type { AIOverrideConfig } from '@/lib/ai';
import type { PublicationOverrides } from '@/lib/publication-rules';
import { sanitizeExecutionProfile } from '@/lib/pipeline/execution-policy';
import { parseBoundedInt } from '@/lib/http';

const VALID_STEPS = new Set<ProcessStep>(['all', 'embedding', 'clustering', 'scoring', 'rewriting']);

function parseOptionalBoundedInt(
  value: string | null | undefined,
  min: number,
  max: number
): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  return parseBoundedInt(value, min, min, max);
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const stepParam = searchParams.get('step');

  let body: {
    step?: string;
    config?: AIOverrideConfig;
    executionProfile?: string;
    maxExecutionMs?: number;
    useProcessingState?: boolean;
    processingLimit?: number;
    llmDelayMs?: number;
  } & PublicationOverrides = {};
  try {
    body = await req.json();
  } catch {
    // Body is optional
  }

  const rawStep = body.step || stepParam || 'all';
  if (!VALID_STEPS.has(rawStep as ProcessStep)) {
    return NextResponse.json({
      success: false,
      error: `Invalid step '${rawStep}'. Allowed values: ${Array.from(VALID_STEPS).join(', ')}`
    }, { status: 400 });
  }
  const step = rawStep as ProcessStep;
  const executionProfile = sanitizeExecutionProfile(body.executionProfile ?? searchParams.get('profile'), 'api');

  const maxExecutionMs = parseOptionalBoundedInt(
    body.maxExecutionMs !== undefined ? String(body.maxExecutionMs) : searchParams.get('maxExecutionMs'),
    10000,
    3600000
  );
  const processingLimit = parseOptionalBoundedInt(
    body.processingLimit !== undefined ? String(body.processingLimit) : searchParams.get('processingLimit'),
    1,
    500
  );
  const llmDelayMs = parseOptionalBoundedInt(
    body.llmDelayMs !== undefined ? String(body.llmDelayMs) : searchParams.get('llmDelayMs'),
    0,
    30000
  );

  try {
    const result = await runProcess({
      step,
      config: body.config,
      executionProfile,
      publicationOverrides: {
        freshOnly: body.freshOnly,
        minSources: body.minSources,
        publishThreshold: body.publishThreshold,
        ignoreMaturity: body.ignoreMaturity
      },
      maxExecutionMs,
      useProcessingState: body.useProcessingState,
      processingLimit,
      llmDelayMs
    });

    if (!result.success && result.retryAfter) {
      return NextResponse.json(result, { status: 429 });
    }

    if (!result.success) {
      return NextResponse.json(result, { status: 500 });
    }

    return NextResponse.json(result);
  } finally {
    // runProcess handles finishProcessing internally when enabled
  }
}
