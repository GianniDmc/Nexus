import { NextRequest, NextResponse } from 'next/server';
import { runProcess, type ProcessStep } from '@/lib/pipeline/process';
import type { AIOverrideConfig } from '@/lib/ai';
import type { PublicationOverrides } from '@/lib/publication-rules';

const VALID_STEPS = new Set<ProcessStep>(['all', 'embedding', 'clustering', 'scoring', 'rewriting']);

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const stepParam = searchParams.get('step');

  let body: { step?: string, config?: AIOverrideConfig } & PublicationOverrides = {};
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

  try {
    const result = await runProcess({
      step,
      config: body.config,
      publicationOverrides: {
        freshOnly: body.freshOnly,
        minSources: body.minSources,
        publishThreshold: body.publishThreshold,
        ignoreMaturity: body.ignoreMaturity
      },
      maxExecutionMs: 270000,
      useProcessingState: true
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
