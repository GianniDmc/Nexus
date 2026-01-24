// Server-side processing state management using database for persistence
import { createClient } from '@supabase/supabase-js';

export interface ProgressInfo {
    current: number;
    total: number;
    label?: string;
}

interface ProcessingState {
    isRunning: boolean;
    step: string | null;
    startedAt: string | null;
    shouldStop: boolean;
    progress?: ProgressInfo;
}

// ...

// ... (getProcessingState implementation same as before) ... to keep type valid
// I will just append updateProgress at the end and update interface definition


const getSupabase = () => createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Use a simple key-value approach with upsert
const STATE_KEY = 'processing_state';

export async function getProcessingState(): Promise<ProcessingState> {
    const supabase = getSupabase();
    const { data } = await supabase
        .from('app_state')
        .select('value')
        .eq('key', STATE_KEY)
        .single();

    if (data?.value) {
        return data.value as ProcessingState;
    }
    return { isRunning: false, step: null, startedAt: null, shouldStop: false };
}

export async function startProcessing(step: string): Promise<boolean> {
    const supabase = getSupabase();

    // Check current state - PREVENT CONCURRENT RUNS
    const current = await getProcessingState();

    // If running and not asked to stop, and started less than 24h ago (avoid persistent dead locks)
    if (current.isRunning && !current.shouldStop) {
        const startDate = current.startedAt ? new Date(current.startedAt) : new Date();
        const now = new Date();
        const hoursRunning = (now.getTime() - startDate.getTime()) / (1000 * 60 * 60);

        // If it's the SAME step, we allow restart (it might be a retry loop)
        // But if it's different step, block it.
        if (current.step !== step && hoursRunning < 24) {
            console.log(`[STATE] startProcessing BLOCKED: '${current.step}' is already running`);
            return false;
        }
    }

    if (current.shouldStop) {
        console.log(`[STATE] startProcessing BLOCKED for step ${step} (Stop requested)`);
        return false;
    }

    console.log(`[STATE] Starting processing for step ${step}`);
    const state: ProcessingState = {
        isRunning: true,
        step,
        startedAt: new Date().toISOString(),
        shouldStop: false
    };

    await supabase
        .from('app_state')
        .upsert({ key: STATE_KEY, value: state }, { onConflict: 'key' });

    return true;
}

export async function stopProcessing(): Promise<void> {
    console.log('[STATE] STOP REQUESTED');
    const supabase = getSupabase();
    const current = await getProcessingState();

    await supabase
        .from('app_state')
        .upsert({
            key: STATE_KEY,
            value: { ...current, shouldStop: true }
        }, { onConflict: 'key' });
}

export async function shouldStopProcessing(): Promise<boolean> {
    const state = await getProcessingState();
    // Also stop if state is implicitly "not running" (e.g. was reset by force stop)
    if (!state.isRunning) return true;
    return state.shouldStop;
}

export async function finishProcessing(): Promise<void> {
    const supabase = getSupabase();
    const state: ProcessingState = {
        isRunning: false,
        step: null,
        startedAt: null,
        shouldStop: false
    };

    await supabase
        .from('app_state')
        .upsert({ key: STATE_KEY, value: state }, { onConflict: 'key' });
}

export async function resetProcessingState(): Promise<void> {
    await finishProcessing();
}

export async function updateProgress(current: number, total: number, label?: string): Promise<void> {
    const supabase = getSupabase();
    // Optimisation: We could read local cache, but for now read DB to avoid overwriting invalid state
    const currentState = await getProcessingState();

    if (!currentState.isRunning) return;

    await supabase
        .from('app_state')
        .upsert({
            key: STATE_KEY,
            value: { ...currentState, progress: { current, total, label } }
        }, { onConflict: 'key' });
}
