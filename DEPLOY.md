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
    | `GROQ_API_KEY` | `gsk_...` |
    | `GOOGLE_API_KEY` | `AIza...` |
    | `ADMIN_USER` | `admin` (ou autre) |
    | `ADMIN_PASSWORD` | `ton-mot-de-passe-complique` |

    > ⚠️ **Sécurité** : `ADMIN_PASSWORD` est maintenant OBLIGATOIRE car j'ai activé la protection sur `/admin`.
    > `SUPABASE_SERVICE_ROLE_KEY` est aussi cruciale pour que l'Admin et l'IA fonctionnent.

6.  Clique sur **"Deploy"**.

Attends quelques minutes... 🎉 Ton site est en ligne !

## 4. Automatisation (Cron Jobs)
Actuellement, l'application met à jour les news quand tu as l'onglet Admin ouvert (`AutoProcessor`). Pour que cela se fasse tout seul en ligne :

**Option 1 : cron-job.org (Gratuit & Facile)**
1.  Crée un compte gratuit sur [cron-job.org](https://cron-job.org/).
2.  Crée un nouveau "Cron Job".
3.  **URL** : `https://ton-projet-vercel.app/api/process` (Remplace par ta vraie URL Vercel).
4.  **Schedule** : Choisis "Every 15 minutes" ou "Every hour".
5.  **Sauvegarde**.

Cela "pingera" ton API régulièrement pour lancer la récupération et le traitement des news, même si tu dors ! 😴

**Option 2 : Supabase Cron (Directement dans la base)**
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
            url:='https://ton-projet-vercel.app/api/process',
            headers:='{"Authorization": "Basic ... (si admin protégé) ou rien si public"}'
        ) as request_id;
      $$
    );
    ```
    *Note : Cette méthode nécessite que ton projet Database ait accès à internet via `pg_net`.*

## 5. Sécurité (Optionnel mais recommandé)
La page `/admin` est actuellement accessible à tous si l'URL est connue.
Pour une version production, il serait idéal d'ajouter une authentification simple (Middleware Next.js) ou d'utiliser Supabase Auth sur cette route.

---

### Résumé des Coûts
- **Vercel Hobby** : Gratuit.
- **Supabase Free** : Gratuit.
- **Groq** : Gratuit (Beta).

Tu as maintenant une News App autonome qui tourne pour 0€/mois ! 🚀
