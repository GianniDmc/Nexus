# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Nexus is an intelligent tech news curation platform that aggregates RSS feeds, applies AI analysis (scoring, clustering, rewriting), and publishes curated news clusters. Built with Next.js 16 (App Router), TypeScript, Supabase (PostgreSQL + pgvector), and Tailwind CSS v4. The project language (comments, docs, UI) is **French**.

## Commands

```bash
npm run dev          # Start dev server (localhost:3000)
npm run build        # Production build (also validates types)
npm run lint         # ESLint 9
npm run db:start     # Start local Supabase (Docker)
npm run db:stop      # Stop local Supabase
npm run db:types     # Regenerate TypeScript types from Supabase schema → src/types/database.types.ts
npm run db:pull      # Pull remote schema changes
npm run db:push      # Push local migrations to remote
npm run db:dump      # Dump schema to supabase/schema.sql
npx tsx scripts/<script>.ts  # Run standalone scripts (cron-ingest, cron-process, daily-report, etc.)
```

No test framework is configured. Validation is done via `npm run build` and `npm run lint`.

## Architecture

### Pipeline (6 steps)

The core data flow is a sequential pipeline: **Ingestion** → **Embedding** → **Clustering** → **Scoring** → **Rewriting** → **Publication**.

- `/api/ingest` — RSS parsing + content scraping, incremental via `last_fetched_at`
- `/api/process` — Runs the 4 processing steps (embedding → clustering → scoring → rewriting/publish)
- Pipeline step implementations live in `src/lib/pipeline/steps/`
- Execution profiles (`api`, `manual`, `refresh`, `gha`, `rpi`) with different timeouts/batch sizes are defined in `src/lib/pipeline/execution-policy.ts`

### AI Strategy (Multi-Provider)

`src/lib/ai.ts` orchestrates multiple LLM providers with tiered selection:
- **FAST** tier (scoring): haiku / gpt-5-mini / gemini-flash
- **SMART** tier (rewriting): sonnet / gpt-5.2 / gemini-flash
- **VECTOR** tier (embeddings): Gemini text-embedding-004
- Provider priority: User keys → `PAID_*` env vars → default env vars → Groq fallback
- Retry with exponential backoff (3 attempts)

### Editorial State Machine

Clusters follow a strict state machine defined in `src/lib/editorial-state.ts`. States flow from `pending_scoring` through incubation states to `eligible_rewriting` → `published` or `archived`. Publication rules are centralized in `src/lib/publication-rules.ts` (threshold 7.5, min 2 sources, 72h freshness, 3h maturity).

### Database

Supabase PostgreSQL with pgvector extension. Key tables: `articles`, `clusters`, `summaries`, `sources`, `app_state`, `digests`. Types are auto-generated in `src/types/database.types.ts` — always run `npm run db:types` after schema changes. Never propose manual SQL changes; use Supabase CLI migrations.

### Frontend

- **Public**: NewsFeed, Featured clusters ("À la Une"), article/story detail pages, digests
- **Admin** (`/admin`): Dashboard, editorial queue, manual pipeline execution, sources CRUD, analytics, AI settings
- Protected routes use Basic Auth via `src/middleware.ts`

### CI/CD

Pipeline runs on a self-hosted Raspberry Pi 3B+ via crontab (`scripts/rpi-pipeline.sh`) every 30 minutes with the `rpi` execution profile. Auto-deploy (`scripts/rpi-deploy.sh`) pulls changes every 5 minutes. GitHub Actions workflow (`cron-process.yml`) is kept but schedule is disabled. Setup guide: `scripts/rpi-setup.md`.

## Key Conventions

- **TypeScript strict** — no `any`
- **Code identifiers in English**, business comments/docs in French
- **Server Components by default** — use `'use client'` only when needed
- **Server Actions for mutations** — avoid API routes except for webhooks/cron
- **Path alias**: `@/*` maps to `src/*`
- **UI libraries**: `lucide-react` (icons), `framer-motion` (animations), `recharts` (charts), `clsx` + `tailwind-merge` (class merging), `date-fns` (dates)
- **Documentation maintenance**: After structural changes, update `docs/ARCHITECTURE.md`. Log major decisions in `docs/DECISIONS.md` as ADRs. Read `docs/ARCHITECTURE.md` before making architectural changes.
