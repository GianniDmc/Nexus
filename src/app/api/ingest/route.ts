import { NextResponse } from 'next/server';
import { runIngest } from '@/lib/pipeline/ingest';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sourceFilter = searchParams.get('source') || undefined; // Filter by source name

  try {
    const result = await runIngest({ sourceFilter });
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
