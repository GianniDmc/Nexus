import { getServiceSupabase } from './supabase-admin';

export type PipelineRunType = 'ingest' | 'process';
export type PipelineRunStatus = 'running' | 'success' | 'error';
export type PipelineRunTrigger = 'auto' | 'manual' | 'cron' | 'api';

export interface PipelineRun {
  id: string;
  type: PipelineRunType;
  step: string | null;
  profile: string | null;
  status: PipelineRunStatus;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  result: Record<string, unknown> | null;
  error: string | null;
  trigger: PipelineRunTrigger;
}

export async function startPipelineRun(params: {
  type: PipelineRunType;
  step?: string;
  profile?: string;
  trigger?: PipelineRunTrigger;
}): Promise<string> {
  const supabase = getServiceSupabase();
  const id = crypto.randomUUID();

  await supabase.from('pipeline_runs').insert({
    id,
    type: params.type,
    step: params.step ?? null,
    profile: params.profile ?? null,
    status: 'running' as const,
    trigger: params.trigger ?? 'api',
  });

  return id;
}

export async function finishPipelineRun(params: {
  id: string;
  status: 'success' | 'error';
  result?: Record<string, unknown>;
  error?: string;
  durationMs?: number;
}): Promise<void> {
  const supabase = getServiceSupabase();

  await supabase
    .from('pipeline_runs')
    .update({
      status: params.status,
      finished_at: new Date().toISOString(),
      duration_ms: params.durationMs ?? null,
      result: params.result ?? null,
      error: params.error ?? null,
    })
    .eq('id', params.id);
}

export async function listPipelineRuns(params?: {
  limit?: number;
  offset?: number;
  type?: PipelineRunType;
}): Promise<{ runs: PipelineRun[]; total: number }> {
  const supabase = getServiceSupabase();
  const limit = params?.limit ?? 50;
  const offset = params?.offset ?? 0;

  let query = supabase
    .from('pipeline_runs')
    .select('*', { count: 'exact' })
    .order('started_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (params?.type) {
    query = query.eq('type', params.type);
  }

  const { data, count } = await query;

  return {
    runs: (data ?? []) as PipelineRun[],
    total: count ?? 0,
  };
}
