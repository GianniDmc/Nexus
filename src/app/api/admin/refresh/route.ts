import { NextResponse } from 'next/server';

export const maxDuration = 300; 

export async function GET(req: Request) {
  const protocol = new URL(req.url).protocol;
  const host = new URL(req.url).host;
  const baseUrl = `${protocol}//${host}`;

  try {
    const ingestRes = await fetch(`${baseUrl}/api/ingest`);
    const ingestData = await ingestRes.json();

    const processResults = [];
    for (let i = 0; i < 3; i++) {
      const processRes = await fetch(`${baseUrl}/api/process`);
      const processData = await processRes.json();
      processResults.push(processData);
      
      if (
        processData.processed?.embeddings === 0 && 
        processData.processed?.rewritten === 0
      ) {
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
