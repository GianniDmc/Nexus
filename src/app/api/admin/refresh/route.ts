import { NextResponse } from 'next/server';
import { runIngest } from '@/lib/pipeline/ingest';
import { runProcess } from '@/lib/pipeline/process';
import { parseBoundedInt } from '@/lib/http';

export const maxDuration = 300; 

async function runRefresh(req: Request) {
  const { searchParams } = new URL(req.url);
  const sourceFilter = searchParams.get('source') || undefined;
  const maxCycles = parseBoundedInt(searchParams.get('cycles'), 3, 1, 10);

  try {
    const ingestData = await runIngest({ sourceFilter, executionProfile: 'refresh' });

    const processResults = [];
    for (let i = 0; i < maxCycles; i++) {
      const processData = await runProcess({
        step: 'all',
        executionProfile: 'refresh'
      });
      processResults.push(processData);

      if (!processData.success || processData.processed?.stopped) {
        break;
      }

      const totalProcessed =
        (processData.processed?.embeddings || 0) +
        (processData.processed?.clustered || 0) +
        (processData.processed?.scored || 0) +
        (processData.processed?.rewritten || 0);

      if (totalProcessed === 0) {
        break;
      }
    }

    return NextResponse.json({
      success: true,
      ingest: ingestData,
      processCycles: processResults.length,
      details: processResults
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return runRefresh(req);
}

export async function POST(req: Request) {
  return runRefresh(req);
}
