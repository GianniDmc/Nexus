import { NextRequest, NextResponse } from 'next/server';
import { listPipelineRuns, type PipelineRunType } from '@/lib/pipeline-runs';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
  const offset = parseInt(searchParams.get('offset') || '0', 10);
  const type = searchParams.get('type') as PipelineRunType | null;

  try {
    const { runs, total } = await listPipelineRuns({
      limit,
      offset,
      type: type ?? undefined,
    });

    return NextResponse.json({ runs, total });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
