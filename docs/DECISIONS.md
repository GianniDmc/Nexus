# Registre des Décisions d'Architecture (ADR)

Ce document consigne les choix techniques structurants du projet **App Curation News Tech**. Chaque décision explique le contexte, les alternatives considérées et la raison du choix final.

## Index des Décisions (ordre chronologique)

| ID | Date | Titre | Statut |
| :--- | :--- | :--- | :--- |
| ADR-001 | 2026-01-23 | Sécurisation de l'Admin par Basic Auth (Middleware) | Validé |
| ADR-002 | 2026-01-23 | Embeddings Gemini pour fiabiliser la production | Validé |
| ADR-003 | 2026-01-24 | Moteur IA multi-providers avec mode Turbo | Validé |
| ADR-004 | 2026-01-24 | État de processing centralisé en DB (app_state) | Validé |
| ADR-005 | 2026-01-25 | Architecture centrée clusters (cluster-centric) | Validé |
| ADR-006 | 2026-01-25 | Automatisation par crons + règles de maturité | Validé |
| ADR-007 | 2026-01-25 | Ingestion bornée à 30 jours (fraîcheur) | Validé |
| ADR-008 | 2026-01-26 | Choix de Supabase comme Backend-as-a-Service | Validé |
| ADR-009 | 2026-01-26 | Utilisation de pgvector pour la recherche sémantique | Validé |
| ADR-010 | 2026-01-26 | Next.js App Router comme framework Frontend | Validé |
| ADR-011 | 2026-01-27 | Harmonisation Stricte des Catégories (Source -> IA) | Validé |
| ADR-012 | 2026-01-27 | Stockage de la Catégorie au niveau Cluster | Validé |
| ADR-013 | 2026-01-28 | Recherche Clusters via RPC dédié | Validé |
| ADR-014 | 2026-01-28 | Système de "Une" (Featured News) par Ranking | Validé |

---

## ADR-001 : Sécurisation de l'Admin par Basic Auth (Middleware)


### Contexte
L'interface `/admin` et les endpoints `/api/admin` exposent des actions sensibles (publication, suppression, clés IA).

### Décision
Protéger `/admin` et `/api/admin` par **Basic Auth** via `src/middleware.ts` avec `ADMIN_USER` et `ADMIN_PASSWORD`.

### Conséquences
- **Positif** : Sécurité minimale immédiate sans implémenter Supabase Auth.
- **Négatif** : Auth statique, gestion par variables d'environnement uniquement.

---

## ADR-002 : Embeddings Gemini pour fiabiliser la production

### Contexte
L'exécution sur Vercel rencontrait des erreurs 500 avec certains appels d'embeddings.

### Décision
Basculer les embeddings sur **Gemini** (`text-embedding-004`) comme provider principal.

### Conséquences
- **Positif** : Réduction des erreurs en production, pipeline stable.
- **Négatif** : Dépendance plus forte à Google pour la vectorisation.

---

## ADR-003 : Moteur IA multi-providers avec mode Turbo

### Contexte
Les coûts et limites de quotas varient selon les providers. Le pipeline doit rester opérationnel sans clé payante.

### Décision
Introduire un **sélecteur multi-providers** (OpenAI/Anthropic/Gemini) avec fallback Groq et un **mode Turbo** quand des clés payantes sont disponibles.

### Conséquences
- **Positif** : Résilience (fallbacks), meilleure vitesse quand des clés payantes sont configurées.
- **Négatif** : Plus de complexité (routing des providers, configs multiples).

---

## ADR-004 : État de processing centralisé en DB (app_state)

### Contexte
Plusieurs clients peuvent déclencher le pipeline simultanément. Il faut un verrouillage et une visibilité partagée.

### Décision
Centraliser l'état de traitement dans **`app_state`** (mutex, step, progression), exposé via `/api/admin/processing-state`.

### Conséquences
- **Positif** : Un seul pipeline actif à la fois, UI admin synchronisée.
- **Négatif** : Dépendance forte à la DB pour l'orchestration.

---

## ADR-005 : Architecture centrée clusters (cluster-centric)

### Contexte
Le modèle article-centric compliquait la publication, les stats et la synthèse éditoriale.

### Décision
Basculer vers une **architecture cluster-centric** : publication, scores et summaries attachés aux clusters.

### Conséquences
- **Positif** : Flux éditorial clair, stats cohérentes, UI centrée sur le sujet.
- **Négatif** : Migration DB et adaptation API/UX nécessaires.

---

## ADR-006 : Automatisation par crons + règles de maturité

### Contexte
Le traitement continu dépendait d'un onglet admin ouvert. Besoin d'automatiser sans sur-publier.

### Décision
Ajouter des **crons** (ingest/process) et des **règles de maturité** (fenêtre temporelle, sources min, seuils) avant publication.

### Conséquences
- **Positif** : Pipeline autonome, qualité des sujets publiés améliorée.
- **Négatif** : Configuration plus riche à maintenir.

---

## ADR-007 : Ingestion bornée à 30 jours (fraîcheur)

### Contexte
Les flux RSS renvoient des articles anciens qui polluent le pipeline.

### Décision
Limiter l'ingestion aux articles publiés dans les **30 derniers jours**.

### Conséquences
- **Positif** : File de traitement plus pertinente et plus rapide.
- **Négatif** : Certains articles evergreen peuvent être ignorés.

---

## ADR-008 : Choix de Supabase comme BaaS

### Contexte
Le projet nécessite une base de données relationnelle robuste, une authentification sécurisée et des capacités temps réel pour afficher l'avancement du processing.

### Décision
Utiliser **Supabase**.

### Conséquences
- **Positif** : Tout-en-un (Auth, DB, Realtime, Edge Functions). Hébergé, scalabilité gérée.
- **Négatif** : Vendor lock-in partiel (bien que basé sur PostgreSQL standard).

---

## ADR-009 : Utilisation de pgvector pour la recherche sémantique

### Contexte
Le cœur du système repose sur le clustering d'articles similaires et la recherche sémantique. Les bases de données vectorielles dédiées (Pinecone, Weaviate) ajoutent de la complexité infrastructurelle.

### Décision
Utiliser l'extension **pgvector** directement dans PostgreSQL (Supabase).

### Conséquences
- **Positif** : Données relationnelles et vectorielles au même endroit (JOINs possibles). Pas d'ETL complexe vers un index externe. Coût inclus dans Supabase.
- **Négatif** : Performance potentiellement inférieure à une DB vectorielle dédiée sur des volumes massifs (>10M vecteurs), mais suffisant pour notre échelle (~100k articles).

---

## ADR-010 : Next.js App Router

### Contexte
Besoin d'un framework React moderne supportant le SSR pour le SEO et les Server Components pour l'optimisation des données.

### Décision
Utiliser **Next.js 14+ avec App Router**.

### Conséquences
- **Positif** : React Server Components (RSC) réduisent le bundle JS client. Meilleure DX avec les Layouts imbriqués.
- **Négatif** : Courbe d'apprentissage vs Pages Router. Écosystème de librairies encore en transition pour certaines compatibilités RSC.

---

## ADR-011 : Harmonisation Stricte des Catégories (Source -> IA)

### Contexte
Les flux RSS sources ont des catégories hétérogènes ("Tech News", "Apple", "Device", etc.) qui polluent l'interface et perturbent le filtrage. L'IA a besoin d'un cadre pour classer efficacement.

### Décision
- **Normalisation à l'ingestion/clustering** : Transformer à la volée les catégories sources en une liste restreinte (ex: "Apple" -> "Mobile").
- **Migration Historique** : Mettre à jour les anciennes données pour correspondre à cette norme.

### Conséquences
- **Positif** : UX cohérente, filtres propres ("Mobile", "IA", "Startup"...). Facilite le travail de l'IA qui part d'une base saine.
- **Négatif** : Perte de la granularité originale de la source (ex: on perd la nuance "iPhone" vs "iPad" au profit de "Mobile"), mais acceptable pour une curation généraliste.

---

## ADR-012 : Stockage de la Catégorie au niveau Cluster

### Contexte
Un cluster contient plusieurs articles qui peuvent avoir des catégories différentes (ex: un de "Mobile", un de "Business"). Le cluster lui-même représente le sujet synthétisé.

### Décision
Ajouter une colonne `category` à la table `clusters`.
- **Initialisation** : Hérite de la catégorie du premier article (normalisée).
- **Validation** : L'IA peut écraser cette catégorie lors de l'étape de "Rewriting" si le contenu le justifie.
- **Affichage** : Le NewsFeed priorise `clusters.category`.

### Conséquences
- **Positif** : La catégorie affichée est celle du *sujet* et non d'un article au hasard. Permet une requalification éditoriale par l'IA.
- **Négatif** : Nécessite de garder les deux colonnes (`articles.category` pour l'historique brut, `clusters.category` pour l'affichage) et de gérer la synchro.

---

## ADR-013 : Recherche Clusters via RPC dédié

### Contexte
L'interface d'administration des clusters nécessitait des filtres combinés (statut, recherche textuelle), un tri multi-critères (date, score, volume) et une pagination performante. Le client JS Supabase standard montrait ses limites pour les agrégations complexes (comptage articles par cluster) combinées à la pagination.

### Décision
Implémenter une fonction PostgreSQL `search_clusters` (RPC) qui encapsule toute la logique de filtre, tri et pagination côté base.

### Conséquences
- **Positif** : Performance optimale (filtrage avant pagination), code API simplifié (`supabase.rpc`), UX fluide.
- **Négatif** : Logique métier déplacée dans une migration SQL (moins flexible que du code TS pur pour les modifs rapides).

---

## ADR-014 : Système de "Une" (Featured News) par Ranking

### Contexte
Pour mettre en valeur les informations cruciales ("Top News") sans masquer le reste du flux, il fallait un moyen automatique de distinguer le "bruit" de l'information majeure, sur toutes les périodes (Aujourd'hui, Hier, Semaine).

### Décision
Implémenter un système de **Ranking** plutôt que de filtrage strict.
- **Formule de Score** : `(Score_IA * 1.5) + (NB_Sources * 0.5)`.
    - Privilégie la qualité (IA) tout en boostant les sujets à fort consensus (Sources).
- **Affichage** : Le Top 3 est extrait et affiché dans une section "À la Une" (1 Hero + 2 Compacts).
- **Scope** : S'applique dynamiquement aux vues "Aujourd'hui", "Hier" et "Cette semaine".

### Conséquences
- **Positif** : Mise en avant automatique et pertinente. Pas de curation manuelle requise.
- **Négatif** : Risque de doublon visuel si non retiré de la liste standard (géré par le code d'affichage).
