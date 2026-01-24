'use client';

import { useState, useEffect } from 'react';
import { Key, Check, X, Loader2, Zap, AlertCircle } from 'lucide-react';

interface AIConfig {
    openaiKey: string;
    anthropicKey: string;
    geminiKey: string;
    preferredProvider: 'auto' | 'openai' | 'anthropic' | 'gemini';
}

const STORAGE_KEY = 'nexus-ai-config';

export function AISettings() {
    const [config, setConfig] = useState<AIConfig>({
        openaiKey: '',
        anthropicKey: '',
        geminiKey: '',
        preferredProvider: 'auto'
    });
    const [testing, setTesting] = useState<string | null>(null);
    const [testResults, setTestResults] = useState<Record<string, boolean | null>>({});
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                setConfig(JSON.parse(stored));
            } catch (e) {
                console.error('Failed to parse stored AI config');
            }
        }
    }, []);

    const handleSave = () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    const handleClear = () => {
        const emptyConfig: AIConfig = {
            openaiKey: '',
            anthropicKey: '',
            geminiKey: '',
            preferredProvider: 'auto'
        };
        setConfig(emptyConfig);
        localStorage.removeItem(STORAGE_KEY);
        setTestResults({});
    };

    const testProvider = async (provider: 'openai' | 'anthropic' | 'gemini') => {
        const keyMap = {
            openai: config.openaiKey,
            anthropic: config.anthropicKey,
            gemini: config.geminiKey
        };

        if (!keyMap[provider]) {
            setTestResults(prev => ({ ...prev, [provider]: false }));
            return;
        }

        setTesting(provider);
        try {
            const res = await fetch('/api/admin/test-provider', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider, apiKey: keyMap[provider] })
            });
            const data = await res.json();
            setTestResults(prev => ({ ...prev, [provider]: data.success }));
        } catch (e) {
            setTestResults(prev => ({ ...prev, [provider]: false }));
        }
        setTesting(null);
    };

    const maskKey = (key: string) => {
        if (!key || key.length < 8) return key;
        return key.substring(0, 4) + '•'.repeat(Math.min(key.length - 8, 20)) + key.substring(key.length - 4);
    };

    const providers = [
        { id: 'openai', name: 'OpenAI', placeholder: 'sk-...', key: 'openaiKey' as const, color: 'text-green-500' },
        { id: 'anthropic', name: 'Anthropic', placeholder: 'sk-ant-...', key: 'anthropicKey' as const, color: 'text-orange-500' },
        { id: 'gemini', name: 'Google Gemini', placeholder: 'AIza...', key: 'geminiKey' as const, color: 'text-blue-500' }
    ];

    return (
        <div className="space-y-6">
            <div className="bg-card border border-border rounded-xl p-6">
                <h2 className="text-lg font-bold mb-2 flex items-center gap-2">
                    <Key className="w-5 h-5 text-accent" />
                    Clés API Temporaires
                </h2>
                <p className="text-sm text-muted mb-6">
                    Saisissez vos clés API pour booster temporairement les fonctionnalités IA.
                    Les clés sont stockées localement dans votre navigateur uniquement.
                </p>

                <div className="space-y-4">
                    {providers.map(provider => (
                        <div key={provider.id} className="flex items-center gap-3">
                            <div className="flex-1">
                                <label className={`text-sm font-medium ${provider.color} mb-1 block`}>
                                    {provider.name}
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="password"
                                        placeholder={provider.placeholder}
                                        value={config[provider.key]}
                                        onChange={e => setConfig(prev => ({ ...prev, [provider.key]: e.target.value }))}
                                        className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:border-accent font-mono"
                                    />
                                    <button
                                        onClick={() => testProvider(provider.id as any)}
                                        disabled={!config[provider.key] || testing === provider.id}
                                        className="px-3 py-2 bg-secondary hover:bg-secondary/80 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
                                    >
                                        {testing === provider.id ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : testResults[provider.id] === true ? (
                                            <Check className="w-4 h-4 text-green-500" />
                                        ) : testResults[provider.id] === false ? (
                                            <X className="w-4 h-4 text-red-500" />
                                        ) : (
                                            'Test'
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-6 pt-4 border-t border-border">
                    <label className="text-sm font-medium text-muted mb-2 block">
                        Provider préféré
                    </label>
                    <select
                        value={config.preferredProvider}
                        onChange={e => setConfig(prev => ({ ...prev, preferredProvider: e.target.value as any }))}
                        className="px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:border-accent"
                    >
                        <option value="auto">Auto (meilleur disponible)</option>
                        <option value="openai">OpenAI</option>
                        <option value="anthropic">Anthropic</option>
                        <option value="gemini">Google Gemini</option>
                    </select>
                </div>

                <div className="mt-6 flex items-center gap-3">
                    <button
                        onClick={handleSave}
                        className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-bold hover:bg-accent/90 transition-colors flex items-center gap-2"
                    >
                        {saved ? <Check className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
                        {saved ? 'Sauvegardé !' : 'Sauvegarder'}
                    </button>
                    <button
                        onClick={handleClear}
                        className="px-4 py-2 bg-secondary text-muted-foreground rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors"
                    >
                        Effacer tout
                    </button>
                </div>

                <div className="mt-4 p-3 bg-secondary/30 rounded-lg flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-muted mt-0.5 shrink-0" />
                    <p className="text-xs text-muted">
                        Sans clé configurée, le système utilise les providers gratuits par défaut
                        (Gemini Flash via GOOGLE_API_KEY, puis Groq/Llama via GROQ_API_KEY).
                    </p>
                </div>
            </div>
        </div>
    );
}

// Helper to get current config from localStorage (for use in other components)
export function getAIConfig(): AIConfig | null {
    if (typeof window === 'undefined') return null;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    try {
        return JSON.parse(stored);
    } catch {
        return null;
    }
}
