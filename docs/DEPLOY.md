# 🚀 Guide de Déploiement Gratuit (Vercel + Supabase)

Ce guide t'explique comment mettre ton application **Nexus** en ligne gratuitement en utilisant **Vercel** (Hébergement), **Supabase** (Base de données) et **Groq** (IA).

## 1. Prérequis
Assure-toi d'avoir :
- Un compte [GitHub](https://github.com/).
- Un compte [Vercel](https://vercel.com/signup).
- Ton projet Supabase actuel (URL et clés).
- Ta clé API Groq.

## 2. Mettre le code sur GitHub
Si ce n'est pas déjà fait, pousse ton code vers un "repository" GitHub privé.

1.  Crée un nouveau repository sur GitHub (ex: `nexus-news`).
2.  Ouvre ton terminal dans le dossier du projet et lance :
    ```bash
    git remote add origin https://github.com/TON_USER/nexus-news.git
    git branch -M main
    git push -u origin main
    ```
    *(Si tu utilises déjà git, ignore cette étape).*

## 2b. Initialiser la Base de Données
Avant de déployer, assure-toi que ta base Supabase est à jour.
1.  Si tu as le CLI configuré : lance `npx supabase db push` (seulement si tu es sûr) ou applique les migrations manquantes manuellement.
2.  Alternative : Va dans le **SQL Editor** de Supabase et vérifie que les tables existent.

## 3. Déployer sur Vercel
C'est la méthode la plus simple pour héberger du Next.js.

1.  Connecte-toi à **Vercel**.
2.  Clique sur **"Add New..."** > **"Project"**.
3.  Sélectionne ton repository GitHub `nexus-news` et clique sur **"Import"**.
4.  **Configuration du Projet** :
    *   Framework Preset: `Next.js` (détecté automatiquement).
    *   Root Directory: `./` (par défaut).
5.  **Environment Variables** (Très Important !).
    Copie-colle les valeurs de ton fichier `.env` local. Ajoute les variables suivantes une par une :

    | Nom | Valeur (Exemple) |
    | :--- | :--- |
    | `NEXT_PUBLIC_SUPABASE_URL` | `https://tes-id.supabase.co` |
    | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUz...` |
    | `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGciOiJIUz...` (Clé secrète `service_role` trouvable dans Supabase > Settings > API) |
    | `GROQ_API_KEY` | `gsk_...` (fallback LLM) |
    | `GOOGLE_API_KEY` | `AIza...` (embeddings + Gemini) |
    | `PAID_OPENAI_API_KEY` | `sk-...` (optionnel, mode turbo) |
    | `PAID_ANTHROPIC_API_KEY` | `sk-ant-...` (optionnel, mode turbo) |
    | `PAID_GOOGLE_API_KEY` | `AIza...` (optionnel, mode turbo) |
    | `ADMIN_USER` | `admin` (ou autre) |
    | `ADMIN_PASSWORD` | `ton-mot-de-passe-complique` |

    > ⚠️ **Sécurité** : `ADMIN_PASSWORD` est OBLIGATOIRE pour accéder à `/admin` et `/api/admin` (auth Basic via middleware).
    > `SUPABASE_SERVICE_ROLE_KEY` est aussi cruciale pour que l'Admin et l'IA fonctionnent.

6.  Clique sur **"Deploy"**.

Attends quelques minutes... 🎉 Ton site est en ligne !

## 4. Automatisation (Cron Jobs)

### Option 1 : GitHub Actions (Recommandé ✅)

L'approche la plus robuste et gratuite. Les workflows sont déjà configurés dans `.github/workflows/`.

1. **Configurer les Secrets GitHub** :
   - Va dans **Settings > Secrets and variables > Actions** de ton repo.
   - Ajoute ces secrets :

   | Secret | Description |
   | :--- | :--- |
   | `NEXT_PUBLIC_SUPABASE_URL` | URL de ton projet Supabase |
   | `SUPABASE_SERVICE_ROLE_KEY` | Clé `service_role` de Supabase |
   | `GOOGLE_API_KEY` | Clé API Google (embeddings) |
   | `GROQ_API_KEY` | Clé API Groq (LLM fallback) |
   | `PAID_OPENAI_API_KEY` | *(Optionnel)* Clé OpenAI pour mode turbo |
   | `PAID_ANTHROPIC_API_KEY` | *(Optionnel)* Clé Anthropic pour mode turbo |
   | `PAID_GOOGLE_API_KEY` | *(Optionnel)* Clé Google payante pour mode turbo |

2. **Workflows configurés** :
   - `cron-process.yml` : Orchestration pipeline (profil runtime `gha`).
     - `17,47 * * * *` : process only
     - `12 */2 * * *` : ingest puis process
     - Pré-check backlog sur `process_only` pour skip les runs vides
     - Skip process automatique si l'ingestion n'a ajouté aucun article
     - Budget process : `MAX_EXECUTION_MS=1080000` (18 min)
     - Timeout workflow : 30 min
   - `cron-ingest.yml` : workflow manuel (`Run workflow`) pour debug ingestion.

3. **Tester manuellement** : Va dans **Actions** > Sélectionne un workflow > **Run workflow**.

> 💡 **Avantage** : Aucun timeout Vercel (limité à 300s), exécution garantie, logs détaillés.

---

### Option 2 : cron-job.org (Simple)
1.  Crée un compte gratuit sur [cron-job.org](https://cron-job.org/).
2.  Crée un nouveau "Cron Job".
3.  **URL** : `https://ton-projet-vercel.app/api/admin/refresh` (ingestion + processing).
4.  **Schedule** : Choisis "Every 15 minutes" ou "Every hour".
5.  **Sauvegarde**.

Cela "pingera" ton API régulièrement pour lancer la récupération et le traitement des news, même si tu dors ! 😴

---

### Option 3 : Supabase Cron (Directement dans la base)
Si tu préfères tout gérer dans Supabase :
1.  Va dans **SQL Editor** sur Supabase.
2.  Active les extensions :
    ```sql
    create extension if not exists pg_cron;
    create extension if not exists pg_net;
    ```
3.  Crée le job (remplace l'URL et ta clé API Service Role pour sécuriser) :
    ```sql
    select cron.schedule(
      'auto-process-every-15m', -- Nom du job
      '*/15 * * * *',           -- Cron (toutes les 15 min)
      $$
      select
        net.http_get(
            url:='https://ton-projet-vercel.app/api/admin/refresh',
            headers:='{"Authorization": "Basic ... (si admin protégé) ou rien si public"}'
        ) as request_id;
      $$
    );
    ```
    *Note : Cette méthode nécessite que ton projet Database ait accès à internet via `pg_net`.*

## 5. Sécurité (Optionnel mais recommandé)
`/admin` et `/api/admin/*` sont protégés en Basic Auth (middleware) via `ADMIN_USER` et `ADMIN_PASSWORD`.
Pour la production, il est recommandé d'ajouter en plus :
- une rotation régulière des credentials,
- un filtrage IP (si possible),
- un secret dédié pour les endpoints pipeline publics (`/api/ingest`, `/api/process`) si exposés.

---

### Résumé des Coûts
- **Vercel Hobby** : Gratuit.
- **Supabase Free** : Gratuit.
- **Groq** : Gratuit (Beta).

Tu as maintenant une News App autonome qui tourne pour 0€/mois ! 🚀
