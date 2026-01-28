const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

// Read .env.local manually
const envPath = path.resolve(process.cwd(), '.env.local');
let envVars = {};
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            const key = match[1].trim();
            const value = match[2].trim().replace(/^"|"$/g, '');
            envVars[key] = value;
        }
    });
}

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || envVars['GOOGLE_API_KEY'];

console.log('--- Verifying Fix (gemini-embedding-001) ---');

async function testEmbedding(apiKey) {
    if (!apiKey) {
        console.log("No API Key");
        return;
    }
    // Using the exact string I put in the code
    const modelName = "models/gemini-embedding-001";
    console.log(`Testing model: ${modelName}`);

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.embedContent("Verification of the fix.");
        console.log(`✅ Success! Embedding length: ${result.embedding.values.length}`);
    } catch (e) {
        console.error(`❌ Failed:`, e.message);
    }
}

testEmbedding(GOOGLE_API_KEY).catch(console.error);
