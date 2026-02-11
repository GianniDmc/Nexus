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
| ADR-015 | 2026-01-28 | Support Progressive Web App (PWA) | Validé |
| ADR-016 | 2026-01-28 | Navigation Mobile par Bottom Bar | Validé |
| ADR-017 | 2026-01-28 | Calcul Client-Side des Catégories et Limite Étendue | Validé |
| ADR-018 | 2026-01-28 | Navigation Gestuelle Mobile (Triage) | Validé |
| ADR-019 | 2026-01-29 | Robustesse API & Champs Calculés (Simulation) | Validé |
| ADR-020 | 2026-01-29 | Gestion sources via Admin & Robustesse Ingestion | Validé |
| ADR-021 | 2026-01-29 | Restauration et Amélioration de la Gestion des Articles Bruts (CMS) | Validé |
| ADR-022 | 2026-01-29 | Workflow Programmatique Supabase "Safe" | Validé |
| ADR-023 | 2026-01-29 | Environnement de Développement Local Supabase (Docker) | Validé |
| ADR-024 | 2026-01-31 | Pagination pour contourner la limite 1000 lignes Supabase | Validé |
| ADR-025 | 2026-01-31 | Stratégie "Reverse Lookup" pour la Sélection des Clusters Candidats | Validé |
| ADR-026 | 2026-01-31 | Machine à États Éditoriale (Incubating, Eligible, Ready) | Validé |
| ADR-027 | 2026-02-04 | Externalisation des Crons vers GitHub Actions | Validé |
| ADR-028 | 2026-02-05 | Stratégie de Partage et Route `/story/[id]` | Validé |
| ADR-029 | 2026-02-05 | Affinement du Consensus par Sources Uniques | Validé |
| ADR-030 | 2026-02-11 | Source unique de vérité éditoriale + réconciliation des métriques | Validé |

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

---

## ADR-015 : Support Progressive Web App (PWA)

### Contexte
Besoin d'offrir une expérience native sur mobile (iPhone/Android) avec une installation sur l'écran d'accueil ("carrée") et un affichage plein écran, sans passer par les Stores.

### Décision
Configurer l'application en **PWA (Progressive Web App)** standard.
- **Manifeste** : `manifest.json` pour définir le nom, les icônes et le mode `standalone` (plein écran).
- **Icônes** : Génération des assets pour iOS (Apple Touch Icon) et Android.
- **Méta iOS** : Ajout des balises `apple-mobile-web-app-capable` dans le layout.

### Conséquences
- **Positif** : Installable comme une app native, pas d'interface navigateur (URL bar), expérience immersive.
- **Négatif** : Gestion du cache navigateur parfois complexe pour les mises à jour (non critique pour une app de contenu).

---

## ADR-016 : Navigation Mobile par Bottom Bar

### Contexte
Le menu "Burger" classique sur mobile cachait des fonctionnalités importantes (filtres archives, recherche) et nécessitait trop de clics pour les actions fréquentes (Home, Hier, Saved). L'ergonomie à une main était médiocre.

### Décision
Adopter une **Bottom Navigation Bar** (barre d'onglets en bas) pour la version mobile.
- Onglets fixes : Aujourd'hui, Hier, Semaine, Ma Liste, Menu.
- Styles et icônes cohérents avec l'application.

### Conséquences
- **Positif** : Navigation plus fluide, accès direct aux contextes temporels clés.
- **Négatif** : Perte de place verticale (compensée par le retrait du header massif).

---

## ADR-017 : Calcul Client-Side des Catégories et Limite Étendue

### Contexte
Les utilisateurs souhaitent que le compteur des catégories ("Mobile 4", "IA 12") reflète le contexte temporel actuel (ex: "Aujourd'hui") et non le total global. De plus, la limite de récupération de 100 articles était trop juste pour voir l'historique sur 7 jours.

### Décision
1. **Augmenter la limite de fetch** : Passer de 100 à 300 articles récupérés au chargement initial.
2. **Filtrage en cascade (Waterfall)** :
   - `fetch(300)` -> `All Items`
   - `All Items` + `Time Filter` (Today/Yesterday) -> `Base Items`
   - `Base Items` -> **Calcul des Catégories** (Count)
   - `Base Items` + `Category Filter` -> `Displayed Items`

### Conséquences
- **Positif** : Les compteurs de catégories sont toujours justes par rapport à ce que voit l'utilisateur (WYSIWYG). L'historique est plus profond.
- **Négatif** : Charge initiale légèrement plus lourde (300 items JSON), mais négligeable pour du texte (< 100kb gzippé).

---

## ADR-018 : Navigation Gestuelle Mobile (Triage)

### Contexte
Sur mobile, l'action de trier (curation) doit être rapide. Les butons sont parfois petits. L'alternative était de swiper pour changer de page (Aujourd'hui -> Hier), mais cela entrait en conflit avec le besoin de trier rapidement les articles individuellement.

### Décision
Implémenter des **Gestes de Swipe sur les cartes articles** :
- **Swipe Droite** -> Sauvegarder (Ma Liste).
- **Swipe Gauche** -> Marquer comme lu/non lu.
- **Swipe Droite (Détail)** -> Fermer l'article (Retour).

Ces gestes s'appliquent à **tous les articles**, y compris ceux "À la Une" (Featured).

Nous abandonnons le swipe de navigation globale (changement d'onglet) au profit d'un triage ultra-rapide ("Inbox Zero" style).

### Conséquences
- **Positif** : Curation beaucoup plus rapide et ergonomique à une main.
- **Négatif** : Nécessite un apprentissage (découvrabilité moins évidente que des boutons, bien que standard sur mobile type Mail/Tinder).


- **5 Onglets** : Aujourd'hui (Home), Hier, Semaine, Ma Liste, Menu.
- **Menu Overlay** : Le 5ème onglet "Menu" ouvre un panneau pour les actions secondaires (Recherche, Archives, Thème).
- **Suppression du Burger** : Le header mobile ne contient plus que le logo.

### Conséquences
- **Positif** : Accès direct aux filtres temporels et favoris (1-tap). Meilleure "thumb-zone". Parité de fonctionnalités avec le Desktop (Hier, Recherche).
- **Négatif** : Espace vertical réduit de ~60px (acceptable sur les écrans modernes).

---

## ADR-019 : Robustesse API & Champs Calculés (Simulation)

### Contexte
Le simulateur de clustering (admin) rencontrait des problèmes d'authentification (RLS) et de schéma (colonne `article_count` manquante sur `clusters`) lors de l'exécution via API Route.

### Décision
1. **Authentification Explicite** : Utiliser `createClient` avec la clé `SERVICE_ROLE` et les options `auth: { persistSession: false, autoRefreshToken: false }` pour garantir les droits admin en contexte serveur, indépendamment du client appelant.
2. **Champs Calculés API-Side** : Ne pas dépendre de triggers/vues DB pour des agrégats simples comme `article_count` dans des contextes critiques. Le calculer à la volée dans l'API (`count(*)` sur articles) pour éviter les désynchronisations de schéma.

### Conséquences
- **Positif** : Fiabilité totale de l'outil d'admin, indépendance vis-à-vis des règles RLS utilisateur.
- **Négatif** : Légère duplication de logique (comptage) hors de la DB, mais justifiée par la stabilité requise.

---

## ADR-020 : Gestion sources via Admin & Robustesse Ingestion

### Contexte
L'ajout de sources RSS se faisait via migrations SQL manuelles, ce qui était rigide. De plus, l'ingestion échouait sur des sites sécurisés (403/410) ou sur des fichiers binaires (PDF). Le calcul des statistiques par source était aussi lent et limité.

### Décision
1. **Interface Admin Sources** : Création d'un CRUD complet dans `/admin` pour ajouter/activer/supprimer des sources sans SQL.
2. **Ingestion Robuste** :
   - Remplacement de `rss-parser` par `fetch` natif avec simulation complète de navigateur (User-Agent Chrome, Headers Accept).
   - Ajout de règles d'exclusion pour les binaires (PDF, IMG).
   - Fallback sur un "RSSReader" générique en cas d'échec du User-Agent navigateur.
3. **Statistiques Server-Side** : Utilisation d'une fonction RPC `get_source_stats` pour compter les articles sans charger les données en mémoire (contournement limite 1000 rows).

### Conséquences
- **Positif** : Autonomie totale pour l'ajout de sources. Ingestion résiliente même sur des sites difficiles (PCMag). Stats fiables.
- **Négatif** : Maintenance plus fine des headers HTTP nécessaire si les protections évoluent.

---

## ADR-021 : Restauration et Amélioration de la Gestion des Articles Bruts (CMS)

### Contexte
La migration vers une architecture "Cluster-Centric" (ADR-005) a masqué la visibilité sur les articles individuels. Les utilisateurs n'avaient plus moyen d'inspecter un article spécifique, de vérifier son contenu original, ou de le supprimer s'il était mal classé, à moins qu'il ne fasse partie d'un cluster visible. De plus, il manquait des outils pour auditer la qualité du clustering à la volée.

### Décision
1.  **Rétablir une Vue CMS Dédiée** : Création d'un onglet "Archives / CMS" (`RawArticleManager`) indépendant des clusters, affichant *tous* les articles ingérés.
2.  **Architecture API Hybride** :
    - L'endpoint `/api/admin/raw-articles` gère la récupération avec pagination et recherche.
    - **Fetch Manuel des Labels Cluster** : Au lieu d'un `JOIN` SQL complexe qui posait des problèmes de performance/fiabilité sur les articles orphelins ou mal liés, l'API effectue une première requête pour les articles, collecte les `cluster_id`, et récupère les labels dans une seconde requête simple (Map-Reduce côté serveur).
3.  **Filtrage Avancé** :
    - Ajout d'un filtre par **Source** (dropdown dynamique).
    - Ajout d'un filtre par **Cluster ID** (pour voir tous les articles d'un même groupe).
4.  **UX d'Inspection** :
    - Modale "Inspection" pour voir le JSON brut et le contenu stocké.
    - Modale "Cluster Drill-down" : Clic sur un nom de cluster pour ouvrir la liste de ses articles, permettant une vérification immédiate de la cohérence du regroupement.

### Conséquences
- **Positif** : Transparence totale sur les données brutes. Capacité de débogage et de modération accrue. L'approche "Manual Fetch" garantit que la liste s'affiche toujours, même en cas de corruption des liens clusters.
- **Négatif** : Ajoute une surface d'interface supplémentaire à maintenir.


---

## ADR-022 : Workflow Programmatique Supabase "Safe"

### Contexte
La gestion de la base de données se faisait partiellement via l'interface web Supabase, créant un risque de désynchronisation et d'absence de versioning. Le besoin était de passer à une gestion 100% programmatique tout en sécurisant l'existant.

### Décision
Adopter un workflow strict basé sur le **Supabase CLI** avec une approche "Backwards Compatible" :
1.  **Backup First** : Toute session de travail commence par `db:dump` pour sécuriser l'état prod.
2.  **Sync-First** : Utilisation systématique de `db:pull` pour transformer les changements UI en migrations versionnées.
3.  **Scripts npm** : encapsulation des commandes complexes (`db:login`, `db:link`, `db:pull`, `db:types`) dans le `package.json` pour éviter les erreurs manuelles.
4.  **Types Automatiques** : Génération des types TypeScript (`src/types/database.types.ts`) après chaque changement de schéma.

### Conséquences
- **Positif** : Sécurité totale (versioning), synchronisation TypeScript/DB garantie, fin des conflits "local vs remote".
- **Négatif** : Nécessite une discipline stricte (ne pas modifier le schéma localement sans passer par une migration ou un pull).

---

## ADR-023 : Environnement de Développement Local Supabase (Docker)

### Contexte
Tester des migrations destructrices ou de grosses refontes de données directement sur la base de production (même via des branches) comporte des risques. Le besoin d'un environnement "bac à sable" totalement isolé et rapide (hors ligne) s'est fait sentir.

### Décision
Mettre en place une instance **Supabase Local** via Docker (`supabase start`).
- Les scripts `db:start` et `db:stop` pilotent ce conteneur.
- Le fichier `.env.local` permet de basculer l'application entière sur cet environnement local via des commentaires.

### Conséquences
- **Positif** : Sécurité maximale pour le dev (0 risque pour la prod). Tests E2E possibles sans latence réseau. Accès complet à un Supabase Studio local.
- **Négatif** : Nécessite Docker Desktop. Consomme des ressources machine (~1-2GB RAM).

---

## ADR-024 : Pagination pour contourner la limite 1000 lignes Supabase

### Contexte
Supabase impose une limite serveur de **1000 lignes** par requête, indépendamment du `.limit()` spécifié côté client. Cette limite affectait silencieusement les requêtes volumineuses, notamment :
- `analytics/route.ts` : comptage des articles ingérés sur 30 jours (~5000 articles)
- `stats/route.ts` : récupération des articles avec cluster_id pour le calcul des clusters éligibles à publication

Le bug se manifestait par des compteurs erronés (clusters éligibles à 0 alors qu'il y en avait 66) et des graphiques incomplets.

### Décision
Implémenter une **boucle de pagination** systématique pour les requêtes volumineuses :

```typescript
let allItems: any[] = [];
let offset = 0;
const pageSize = 1000;
let hasMore = true;

while (hasMore) {
  const { data: batch } = await supabase
    .from('table')
    .select('...')
    .range(offset, offset + pageSize - 1);

  if (batch && batch.length > 0) {
    allItems = allItems.concat(batch);
    offset += pageSize;
    hasMore = batch.length === pageSize;
  } else {
    hasMore = false;
  }
}
```

### Fichiers impactés
- `src/app/api/admin/stats/route.ts` : pagination pour récupérer tous les articles avec cluster_id
- `src/app/api/admin/analytics/route.ts` : pagination pour l'ingestion sur 30 jours

### Conséquences
- **Positif** : Données complètes et exactes. Les 66 clusters éligibles sont maintenant correctement identifiés.
- **Négatif** : Léger surcoût en temps (requêtes multiples), acceptable pour les endpoints admin non-critiques.

## ADR-025 : Stratégie "Reverse Lookup" pour la Sélection des Clusters Candidats

### Contexte
L'étape de réécriture (Rewriting) doit identifier les clusters éligibles à la publication (Score suffisant, Non publiés, Frais, Sources multiples).
L'approche initiale "Deep Search" scannait la table `clusters` triée par score. Problème : avec le temps, les clusters à haut score s'accumulent (vieux sujets populaires non publiés), obligeant le système à scanner des milliers de lignes avant de trouver un cluster "frais".

### Décision
Adopter une stratégie **"Reverse Lookup"** (Recherche Inversée) :
1.  **Point de départ** : Requêter la table `articles` pour trouver les articles publiés dans la fenêtre de fraîcheur (ex: < 48h).
2.  **Projection** : Extraire les `cluster_id` uniques de ces articles frais pour ne cibler que les sujets actifs.
3.  **Vérification** : Récupérer ces clusters pour valider Score et Statut, puis fetcher leur historique complet pour valider la règle multi-sources.

### Conséquences
-   **Performance optimale** : La complexité dépend du volume d'actualité récente (constant), et non de l'historique total (croissant).
-   **Qualité** : Élimine le risque de traiter des "faux positifs" (vieux clusters).
-   **Simplicité** : Remplace une boucle paginée complexe par une séquence de 3 requêtes ciblées.

---

## ADR-026 : Machine à États Éditoriale (Incubating, Eligible, Ready)

### Contexte
Le système binaire "Publié / Non Publié" était insuffisant pour trier le flux entrant. Les clusters à fort potentiel mais "jeunes" (1 seule source) se mélangeaient aux clusters "faibles" ou "en attente". Il manquait une zone tampon pour laisser grossir les sujets prometteurs.

### Décision
Formaliser une **Machine à États** stricte pour les clusters, indépendante des articles :
1.  **Pending** : Nouveau né, en attente de scoring.
2.  **Low Score** : Rejeté par l'IA (< 8/10).
3.  **Incubating** : Bon score (>= 8) mais **trop tôt** (1 seule source OU < 6h). On attend.
4.  **Eligible** : Bon score + **Mature** (> 6h ET >= 2 sources). Prêt pour rédaction.
5.  **Ready** : Synthèse générée par l'IA. En attente de validation humaine.
6.  **Published** : Validé et en ligne.
7.  **Archived** : Était bon mais a expiré (> 48h) avant de devenir Eligible.

### Conséquences
-   **Positif** : Clarté totale pour l'éditeur. Les sujets prometteurs ne sont plus perdus. Le système "attend" intelligemment qu'une seconde source confirme une info avant de proposer une synthèse.
-   **Négatif** : Ajoute une complexité logique dans le filtrage (gérée par le script de couverture).

---

## ADR-027 : Externalisation des Crons vers GitHub Actions

### Contexte
Le pipeline de traitement (`/api/process`) nécessite jusqu'à 12 minutes pour traiter un gros backlog (embeddings + clustering + scoring + rewriting). Les fonctions Vercel sont limitées à **300 secondes** (plan Hobby/Pro), ce qui causait des timeouts et des traitements incomplets.

### Décision
Externaliser les jobs de cron dans **GitHub Actions** plutôt que d'utiliser des crons externes (cron-job.org) ou Supabase pg_cron.

**Architecture** :
1. **Scripts standalone** (`scripts/cron-ingest.ts`, `scripts/cron-process.ts`) :
   - Chargement explicite de `.env.local` via `dotenv` pour le dev local.
   - Import des fonctions métier depuis `src/lib/pipeline/`.
   - Sortie JSON structurée pour parsing CI.

2. **Workflows GitHub Actions** (`.github/workflows/`) :
   - `cron-ingest.yml` : Déclenché toutes les 2h, timeout 20min.
   - `cron-process.yml` : Déclenché toutes les 15min, timeout 20min, `MAX_EXECUTION_MS=720000` (12min).
   - Secrets injectés via `secrets.*`.

3. **Lazy initialization des clients AI** (`src/lib/ai.ts`) :
   - Les clients (Groq, Gemini) sont initialisés à la demande et non au chargement du module.
   - Permet aux scripts de charger les variables d'environnement avant l'initialisation.

### Alternatives considérées
- **cron-job.org** : Simple mais dépendance externe, pas de logs, appelle les routes Vercel (timeout).
- **Supabase pg_cron** : Nécessite `pg_net`, latence réseau, pas de logs Node.js.
- **Vercel Cron** : Limité à 60s max, insuffisant pour le pipeline.

### Conséquences
-   **Positif** : Aucune limite de timeout (20min max GitHub), logs détaillés, exécution garantie, secrets sécurisés.
-   **Négatif** : Nécessite la configuration des secrets GitHub. Les logs sont dans l'onglet Actions (pas Vercel).

---

## ADR-028 : Stratégie de Partage et Route `/story/[id]`

### Contexte
Nous souhaitions permettre le partage d'articles (Clusters) depuis le NewsFeed. L'architecture actuelle distingue les `articles` (sources brutes) des `clusters` (sujets regroupés).

### Décision
1.  **Route dédiée `/story/[id]`** : Création d'une nouvelle route pour afficher la synthèse d'un cluster. Le terme "Story" a été choisi pour éviter la confusion avec "Article" (source brute) et refléter le caractère narratif/synthétique du contenu.
2.  **Partage Natif** : Utilisation de l'API `navigator.share()` sur mobile pour une intégration système fluide, avec fallback presse-papier sur desktop.
3.  **Sanatization des données de partage** : Envoi uniquement de l'URL et du Titre à l'API de partage. L'ajout de texte additionnel ("text") a été supprimé car il polluait l'URL sur certaines implémentations (concaténation forcée).
4.  **Open Graph** : Implémentation de `generateMetadata` côté serveur pour garantir que les liens partagés sur Twitter/LinkedIn/etc. affichent une belle `og:image`, le titre et le résumé.

### Conséquences
- Les URL partagées sont propres et permanentes.
- Le partage mobile est natif.
- SEO amélioré pour les contenus générés.
---

## ADR-029 : Affinement du Consensus par Sources Uniques

### Contexte
Le pipeline générait parfois des "faux positifs" en considérant comme "candidat viable" un cluster composé de plusieurs articles provenant de la même source (ou du même flux RSS dupliqué).
La liste "File d'attente" (admin) se basait sur le nombre total d'articles, tandis que le "Dashboard" (AutoProcessor) utilisait un filtre plus strict sur les sources uniques, créant une incohérence visuelle pour l'éditeur (articles visibles mais jamais traités).

### Décision
Standardiser la définition du **Consensus** :
1.  **Critère Unique** : Un sujet n'est considéré "Eligible" (et donc visible en File d'Attente) que s'il comporte au moins **2 Sources Uniques** (`source_name` distincts).
2.  **Alignement** : L'API Admin (`/api/admin/articles`) utilise désormais ce filtre strict pour l'état "Eligible", déplaçant les clusters mono-source (même avec 10 articles) vers l'état "Incubating".
3.  **Optimisation** : Ajout d'un index SQL sur `articles(cluster_id)` pour garantir que le comptage et le filtrage restent performants malgré la complexité du recoupement.

### Conséquences
-   **Positif** : Cohérence totale entre ce que l'éditeur voit et ce que l'IA va traiter. Réduction du bruit (élimination des "compilations" d'une seule source).
-   **Négatif** : Un scoop exclusif relayé massivement par une seule source restera en "Incubation" tant qu'un autre média ne l'aura pas repris (ce qui est le comportement souhaité pour un agrégateur de "Consensus").

---

## ADR-030 : Source unique de vérité éditoriale + réconciliation des métriques

### Contexte
Les chiffres divergeaient entre:
- la file éditoriale (`/api/admin/articles`),
- le dashboard (`/api/admin/stats`),
- et la sélection réelle du process rewriting (`runProcess`).

Des symptômes visibles apparaissaient:
- onglet "File d'attente" non aligné avec "Rédaction",
- "Attente maturité" contenant des mono-sources ambiguës,
- dashboard difficile à lire car mélange d'unités (articles vs clusters) et décompositions implicites.

### Décision
1. **Classifier centralisé**
   - Introduire `src/lib/editorial-state.ts` comme moteur unique de classification.
   - Tous les consommateurs (API articles, API stats, process rewriting) utilisent le même classifier.
2. **States explicites et exclusifs côté tabs**
   - `incubating_maturity` = maturité pure.
   - `incubating_sources` = sources insuffisantes, y compris l'état mixte `incubating_maturity_sources`.
3. **Maturité basée sur l'âge réel du sujet**
   - Ancre de maturité = `oldest article.published_at`.
   - Fallback `cluster.created_at` uniquement si dates articles absentes.
4. **Réconciliation métrique visible**
   - Dashboard enrichi avec des compteurs de décomposition:
     - `publishedRelevantClusters`,
     - `pendingActionableClusters`,
     - `pendingMaturityClusters`,
     - `pendingSourcesClusters`,
     - `pendingArchivedClusters`,
     - `summaryBlockedClusters`,
     - `anomalyEmptyClusters`,
     - deltas de cohérence (`relevantGapClusters`).
   - Diffusion affichée en "sujets pertinents publiés" avec sous-total "total publiés".
5. **Aucune nouvelle logique SQL obligatoire**
   - Pas de nouvelle migration fonctionnelle obligatoire pour la state machine.
   - La RPC historique `get_pipeline_stats` reste utilisée pour les agrégats existants.

### Fichiers impactés
- `src/lib/editorial-state.ts`
- `src/app/api/admin/articles/route.ts`
- `src/app/api/admin/stats/route.ts`
- `src/lib/pipeline/process.ts`
- `src/components/admin/ArticleManager.tsx`
- `src/components/admin/ManualSteps.tsx`
- `src/app/admin/page.tsx`

### Conséquences
- **Positif** : Cohérence stricte entre UI éditoriale, dashboard et exécution pipeline.
- **Positif** : Débogage simplifié grâce aux deltas de réconciliation affichés.
- **Négatif** : Complexité logique déplacée côté TypeScript (classifier), demandant discipline de maintenance.
