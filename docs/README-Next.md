# Notes Next.js (Nexus)

Ce document résume l'organisation Next.js spécifique au projet. Pour l'architecture complète, voir `docs/ARCHITECTURE.md`.

## Structure App Router
- **Entrée principale** : `src/app/page.tsx` (flux public)
- **Admin** : `src/app/admin/page.tsx`
- **Articles** : `src/app/article/[id]/page.tsx`
- **Digest** : `src/app/digest/[id]/page.tsx`

## API Routes
Les API routes sont définies dans `src/app/api/**/route.ts`.
- Pipeline : `api/ingest`, `api/process`, `api/refresh`
- Admin : `api/admin/*` (stats, analytics, clusters, sources, rewrite, etc.)
- Digest : `api/digest`

## Auth Admin (Middleware)
Le middleware protège `/admin` et `/api/admin` via Basic Auth :
- `src/middleware.ts`
- Variables: `ADMIN_USER`, `ADMIN_PASSWORD`

## Supabase
- **Client public** : `src/lib/supabase.ts` (anon key)
- **Serveur** : helper centralisé `src/lib/supabase-admin.ts` via `getServiceSupabase()`

## Editorial State Machine
- Source unique: `src/lib/editorial-state.ts`
- Réutilisée par:
  - `src/app/api/admin/articles/route.ts`
  - `src/app/api/admin/stats/route.ts`
  - `src/lib/pipeline/process.ts` (sélection rewriting)

## Rendu dynamique
Certaines routes forcent le rendu dynamique (`export const dynamic = 'force-dynamic'`) pour éviter le cache.

## Lancement local
```bash
npm run dev
```
