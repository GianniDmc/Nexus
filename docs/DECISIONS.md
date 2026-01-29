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

