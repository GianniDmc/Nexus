import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(request: Request) {
    try {
        const { provider, apiKey } = await request.json();

        if (!provider || !apiKey) {
            return NextResponse.json({ success: false, error: 'Missing provider or apiKey' }, { status: 400 });
        }

        // Test with a minimal request
        if (provider === 'openai') {
            const client = new OpenAI({ apiKey });
            await client.models.list();
            return NextResponse.json({ success: true });
        }

        if (provider === 'anthropic') {
            const client = new Anthropic({ apiKey });
            // Simple message test
            await client.messages.create({
                model: 'claude-haiku-4-5', // Updated to 2026
                max_tokens: 10,
                messages: [{ role: 'user', content: 'Hi' }]
            });
            return NextResponse.json({ success: true });
        }

        if (provider === 'gemini') {
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });
            await model.generateContent('Test');
            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ success: false, error: 'Unknown provider' }, { status: 400 });

    } catch (error: any) {
        console.error('Provider test failed:', error.message);
        return NextResponse.json({ success: false, error: error.message }, { status: 200 });
    }
}
