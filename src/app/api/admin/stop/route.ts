import { NextResponse } from 'next/server';
import { stopProcessing } from '@/lib/processing-state';

export async function POST() {
    try {
        await stopProcessing();
        return NextResponse.json({ success: true, message: 'Stop signal sent' });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
