import { NextRequest, NextResponse } from 'next/server';
import { getProcessingState, stopProcessing, resetProcessingState } from '@/lib/processing-state';

export const dynamic = 'force-dynamic';

// GET - Check current processing state
export async function GET() {
    const state = await getProcessingState();
    return NextResponse.json(state);
}

// POST - Stop the current processing
export async function POST(req: NextRequest) {
    const { action } = await req.json().catch(() => ({ action: 'stop' }));

    if (action === 'stop') {
        await stopProcessing();
        return NextResponse.json({ success: true, message: 'Stop signal sent' });
    }

    if (action === 'reset') {
        await resetProcessingState();
        return NextResponse.json({ success: true, message: 'State reset' });
    }

    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
}

