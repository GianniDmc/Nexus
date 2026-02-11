import { NextResponse } from 'next/server';
import { runIngest } from '@/lib/pipeline/ingest';
import { sanitizeExecutionProfile } from '@/lib/pipeline/execution-policy';

async function runIngestRoute(req: Request) {
  const { searchParams } = new URL(req.url);
  const sourceFilter = searchParams.get('source') || undefined; // Filter by source name
  const executionProfile = sanitizeExecutionProfile(searchParams.get('profile'), 'api');

  try {
    const result = await runIngest({ sourceFilter, executionProfile });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return runIngestRoute(req);
}

export async function POST(req: Request) {
  return runIngestRoute(req);
}
