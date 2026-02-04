import { NextRequest, NextResponse } from 'next/server';
import { runProcess, type ProcessStep } from '@/lib/pipeline/process';
import type { AIOverrideConfig } from '@/lib/ai';
import type { PublicationOverrides } from '@/lib/publication-rules';

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const stepParam = searchParams.get('step');

  let body: { step?: string, config?: AIOverrideConfig } & PublicationOverrides = {};
  try {
    body = await req.json();
  } catch (e) {
    // Body is optional
  }

  const step = ((body.step || stepParam) as ProcessStep) || 'all';

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
