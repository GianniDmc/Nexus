-- Enable the pg_net extension to make HTTP requests
create extension if not exists pg_net;

-- Enable the pg_cron extension to schedule jobs
create extension if not exists pg_cron;

-- 1. CRON INGESTION (Every 3 hours)
-- Calls the /api/ingest endpoint to fetch new articles
select cron.schedule(
  'nexus_ingest',          -- Job name
  '0 */3 * * *',           -- Schedule: Every 3 hours (minute 0)
  $$
  select
    net.http_get(
      -- Remplacer par l'URL de votre projet Vercel de production
      url:='https://YOUR_VERCEL_PROJECT_URL.vercel.app/api/ingest',
      headers:='{"Content-Type": "application/json"}'::jsonb
    ) as request_id;
  $$
);

-- 2. CRON PROCESSING (Every 15 minutes)
-- Calls the /api/process endpoint to churn the queue
select cron.schedule(
  'nexus_process',         -- Job name
  '*/15 * * * *',          -- Schedule: Every 15 minutes
  $$
  select
    net.http_post(
      -- Remplacer par l'URL de votre projet Vercel de production
      url:='https://YOUR_VERCEL_PROJECT_URL.vercel.app/api/process',
      headers:='{"Content-Type": "application/json"}'::jsonb,
      body:='{"step": "all"}'::jsonb
    ) as request_id;
  $$
);

-- Note: To check logs: select * from cron.job_run_details order by start_time desc;
-- Note: To unschedule: select cron.unschedule('nexus_ingest');
