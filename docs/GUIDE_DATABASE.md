# Workflow Supabase Programmatique (Safe)

Ce document résume comment gérer la base de données Supabase de manière 100% programmatique et sécurisée, suite à la mise en place du workflow CLI.

## 1. Principes Clés

- **Plus de modifications manuelles** : On ne touche plus à l'onglet "Table Editor" de Supabase pour créer/modifier des colonnes (sauf urgence absolue).
- **Tout est versionné** : Chaque changement d'état de la prod est capturé dans un fichier de migration `supabase/migrations/YYYYMMDDHHMMSS_name.sql`.
- **Types TypeScript synchrones** : Le code applicatif (`database.types.ts`) est toujours un reflet exact de la DB.

## 2. Commandes Quotidiennes

J'ai configuré des alias dans `package.json` pour simplifier la vie :

### A. Récupérer des changements (Sync)
Si vous avez **modifié quelque chose via l'UI Supabase** (ou si un collègue l'a fait) :
```bash
npm run db:pull
```
*Cela va créer un nouveau fichier de migration local correspondant aux différences.*

### B. Sauvegarder TOUT (Backup)
Pour mettre à jour le fichier de référence `supabase/schema.sql` (votre filet de sécurité) :
```bash
npm run db:dump
```

### C. Mettre à jour le code (Types)
Dès que la DB change, mettez à jour les types TS pour que l'IntelliSense suive :
```bash
npm run db:types
```

## 3. Créer une nouvelle migration (Le bon workflow)

Pour ajouter une fonctionnalité (ex: nouvelle table) sans passer par l'UI :

1.  Créer le fichier :
    ```bash
    npx supabase migration new nom_de_ma_feature
    ```
2.  Écrire le SQL dans le fichier généré (`supabase/migrations/...`).
3.  Appliquer localement (si vous avez une instance locale) OU pousser vers Supabase :
    ```bash
    npm run db:push
    ```
    *(Attention : `db:push` applique directement sur la base liée. Assurez-vous d'avoir fait un `db:dump` avant par sécurité).*

## 4. En cas de problème

Si l'historique semble cassé ou si Supabase rouspète lors d'un pull :
```bash
npx supabase migration repair --status applied <VERSION_ID>
```
*Cela permet de dire manuellement "T'inquiète, cette version est déjà en place".*

## 5. Environnement Local (Docker)

Vous pouvez lancer une réplique exacte de la prod sur votre machine pour tester sans risque.

### Commandes
- **Démarrer** : `npm run db:start` (Lance Docker, Postgres, Studio, etc.)
- **Arrêter** : `npm run db:stop` (Libère les ressources)

### Accès
- **Studio (Admin UI)** : [http://localhost:54323](http://localhost:54323)
- **API URL** : `http://localhost:54321`
- **DB** : `postgresql://postgres:postgres@localhost:54322/postgres`

### Switcher Local <-> Prod
Dans `.env.local`, décommentez le bloc correspondant :
```bash
# --- LOCAL (Docker) ---
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
...
```
*N'oubliez pas de redémarrer `npm run dev` après un changement de variable d'env.*
