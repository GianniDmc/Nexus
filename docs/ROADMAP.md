# Roadmap Technique - App Curation News Tech

Ce document recense les améliorations techniques et fonctionnelles prévues pour le système de curation.

## 🚀 Fonctionnalités Récemment Implémentées
- [x] **Administration** : Gestionnaire d'articles avec filtres (Publiés, Prêts, etc.), Tri par Score/Date, indicateurs de réécriture IA.
- [x] **Pipeline** : Suppression des quotas de publication (Publication illimitée pour les articles pertinents).
- [x] **Vue Éditoriale** : États de Clusters précis (Eligible, Incubating, Pending) avec descriptions contextuelles dans l'admin.
- [x] **Clustering** : Ajustement du seuil de similarité (0.75), seuil de cohérence strict (0.80) et anti-mega-clusters.
- [x] **Multi-Provider IA** : Interface Admin pour clés OpenAI/Anthropic/Gemini avec sélection automatique des modèles (Fast/Smart).
- [x] **Analytics Avancés** : Tableaux de bord avec "Pulse 72h" (activité horaire), "Trend 30d" (tendance mensuelle) et Top Sources.
- [x] **Harmonisation des Données** : Normalisation stricte des catégories (Source -> Standard IA) et migration de l'historique.
- [x] **Pilotage IA** : AutoProcessor + étapes manuelles (ingestion, embeddings, clustering, scoring, rewriting) avec filtres dynamiques.
- [x] **Sources** : Listing et ingestion par source depuis l'admin (lecture seule pour l'instant).
- [x] **Similitude** : Outil admin pour tester la similarité entre deux articles.
- [x] **Refonte Cluster Management** : Interface admin avec filtres (statut), tri (date/score/volume), pagination et moteur de recherche RPC (`search_clusters`).
- [x] **Simulation Clustering** : Outil de debug pour visualiser si un article rejoindrait un cluster existant.
- [x] **Navigation & UX** : Refonte Sidebar (Temps/Context), Filtres Catégories (Pills) et amélioration de la lisibilité `NewsFeed`.
- [x] **Featured News ("À la Une")** : Système de ranking (Score IA + Sources) pour mettre en avant le Top 3 (Hero + Compacts) sur Aujourd'hui/Hier/Semaine.
- [x] **PWA** : Configuration manifest, icônes et métadonnées pour installation native sur iOS/Android.
- [x] **Navigation Mobile** : Remplacement du menu burger par une Bottom Bar 5 onglets (Home, Hier, Semaine, Ma Liste, Menu).
- [x] **Admin Mobile** : Correction de l'affichage du panneau d'administration sur mobile (padding, scroll horizontal).
- [x] **Stabilité Build** : Correction des erreurs de build Vercel (Suspense sur `MobileNav`).
- [x] **Smart Filters** : Filtres catégories dynamiques (tri par volume, compteurs contextuels) + UI compacte (Badges).
- [x] **Gestures Mobile** : Swipe sur les articles pour Sauvegarder (droite) ou Marquer lu (gauche).
- [x] **Partage Social** : Bouton Share natif + Page `/story/[id]` optimisée SEO/Open Graph pour le partage de clusters.
- [x] **Gestion Sources Admin** : Interface CRUD complète pour gérer les flux RSS, activation/désactivation et stats temps réel.
- [x] **Ingestion Robuste** : Support des sites protégés (403/401) via simulation navigateur et filtrage automatique des binaires (PDF/Images).
- [x] **Restauration CMS & Inspection** : Vue "Raw Articles" complète avec filtres (Source, Cluster), inspection JSON et navigation inter-clusters.
- [x] **CI/CD GitHub Actions** : Externalisation des crons hors Vercel (workflow pipeline orchestré + garde-fous de skip process: après ingest vide et en process-only via pré-check backlog, avec drain par étapes après ingest). Scripts standalone avec chargement `dotenv`.
- [x] **Alignement Editorial/Process/Stats** : classifier éditorial unifié (`editorial-state`), tabs exclusives (maturité vs sources), maturité basée sur le premier article, et dashboard avec décomposition + deltas de réconciliation.
- [x] **Execution Policy centralisée** : profils runtime `api/manual/refresh/gha` pour ingest + process, avec bornes de sécurité sur overrides.
- [x] **Pipeline Process modulaire** : refactor `process.ts` en orchestrateur + étapes dédiées (`embedding`, `clustering`, `scoring`, `rewriting`) avec contexte/types partagés.
- [x] **Tuning GitHub Actions** : Simplification cron avec budget global dynamique `MAX_EXECUTION_MS=1440000` (24 minutes) et isolation stricte du drain (les étapes suivantes sont skippées si la précédente bloque).
- [x] **Routing LLM configurable** : stratégie centralisée par provider/tier avec fallback multi-modèles Gemini + ordre providers configurable par env.
- [x] **Optimisation Supabase** : activation RLS, réduction de l'egress (NewsFeed serveur, requêtes ciblées) et nettoyage incrémental des vieux embeddings.

## 🔮 Améliorations Futures (Backlog)

### Priorités (ordre recommandé)
1. **P0 — Fiabilité & Sécurité** : cohérence cluster‑centric, verrouillage pipeline, endpoints publics, décisions de clustering.
2. **P1 — Performance & Scalabilité** : requêtes lourdes, stats/analytics SQL, indexes, optimisations batch.
3. **P2 — Hygiène & UX** : nettoyage legacy, factorisation, micro‑optimisations front.

### 0. Audit Codebase (Février 2026) — Plan d'amélioration
- [x] **[P0] Alignement cluster‑centric** : suppression des reliquats article‑centric (`articles.final_score`) et bascule totale vers `clusters.final_score`.
- [ ] **[P2] Digest (legacy)** : clarifier “déprécié / non utilisé” et éviter toute refonte; optionnellement nettoyer la route/UX si inutiles.
- [ ] **[P0] Representative article** : exploiter `representative_article_id` pour la synthèse, l’image et la sélection “article principal”.
- [ ] **[P0] Décision de simulation** : homogénéiser les valeurs (`NEW_CLUSTER` / `CREATE_CLUSTER`) et supprimer `create_new_force`.
- [ ] **[P0] Sélection auto feed** : corriger le re‑select intempestif lié à la closure de `items`.
- [ ] **[P1] Centralisation Supabase admin** : créer un helper unique pour le client “service role”.
- [ ] **[P1] Règles de publication** : factoriser encore plus et éviter les duplications de logique entre API / admin / stats.
- [ ] **[P1] Validation des payloads** : ajouter `zod` côté API pour sécuriser les entrées.
- [ ] **[P2] Nettoyage legacy** : supprimer ou archiver `computeFinalScore()` et tout code mort associé.

### 0b. Performance DB & Requêtes
- [ ] **[P1] RPC pour filtres métier** : remplacer les post‑filtres JS par SQL (freshness, min sources, publish threshold).
- [ ] **[P1] Stats admin optimisées** : déplacer les agrégations lourdes côté SQL/RPC.
- [ ] **[P1] Analytics** : remplacer les scans complets par `GROUP BY`, `date_trunc`, vues matérialisées si besoin.
- [ ] **[P1] Counts légers** : éviter `select('*')` pour les comptes; utiliser `select('id', { count: 'exact', head: true })`.
- [ ] **[P1] Indexes** : vérifier/ajouter indexes sur `articles(created_at, published_at, cluster_id, embedding IS NULL)` et `clusters(final_score, is_published, published_on)`.

### 0c. Pipeline & IA
- [ ] **[P0] Parsing robuste JSON** : validation des réponses LLM (schema + fallback).
- [ ] **[P1] Prompts plus compacts** : limiter le nombre de sources envoyées (top N par score/fraîcheur).
- [x] **[P1] Embeddings resilients** : retries + backoff + liste de modèles Gemini configurable sur `generateEmbedding`.
- [ ] **[P0] Circuit-breaker provider** : désactiver temporairement un provider après N erreurs consécutives pour éviter le thrashing pendant les pics.
- [ ] **[P0] Verrouillage pipeline** : remplacer le lock applicatif par un lock SQL atomique (`pg_advisory_lock`).

### 0d. Sécurité & Ops
- [ ] **[P0] Protéger `/api/ingest` et `/api/process`** : token/secret header pour éviter l’abus public.
- [ ] **[P0] Durcir les endpoints admin** : contrôle d’accès et rate‑limit de base sur routes sensibles.

### 0e. Front & UX
- [x] **[P1] Migration RSC/ISR** : Le NewsFeed est maintenant servi quasi gratuitement via ISR 60s, réduisant massivement l'egress.
- [ ] **[P2] Parsing JSON optimisé** : `useMemo` pour éviter les `JSON.parse` multiples.
- [ ] **[P2] Cache des sources** : mémoriser les sources par cluster pour limiter les requêtes répétées.
- [ ] **[P2] Nettoyage UI** : retirer les doublons (ex: `getPageTitle()`), simplifier le state.

### 1. Dynamic Throughput Tuning
**Objectif** : Ajuster dynamiquement le débit de traitement (items par batch) en fonction du volume d'ingestion réel, pour optimiser les coûts et la latence.
- Si volume ingestion faible : Réduire le batch size (ex: 5-10) pour économiser les appels et réduire le bruit.
- Si volume ingestion élevé (Breaking News) : Augmenter automatiquement le batch size (ex: 50+) et la fréquence de "Processing" pour absorber le pic.
- Monitoring du "Backlog Size" pour déclencher le mode Turbo automatiquement.

### 2. Live Cluster Updates (Mise à jour incrémentale)
**Problème** : Actuellement, une fois qu'un cluster est publié (article synthétisé), il est "verrouillé". Si une nouvelle source majeure (ex: TechCrunch) publie une info cruciale 1 heure plus tard, elle rejoint le cluster mais le résumé en ligne n'est pas mis à jour.
**Solution** :
- Détecter l'ajout d'un article à fort score (> 7/10) dans un cluster déjà publié.
- Déclencher une nouvelle synthèse (Rewrite) incluant cette nouvelle source.
- Mettre à jour l'article publié avec mention "Mise à jour".

### 3. Advanced Consensus Scoring
**Problème** : Le scoring est individuel. Un article clickbait ou mal interprété par l'IA peut obtenir une bonne note isolée et déclencher une publication non méritée.
**Solution** :
- Ne pas se fier à une seule note.
- Calculer un "Score de Cluster" basés sur la moyenne pondérée des 3 meilleurs articles du groupe.
- Si le cluster ne contient qu'un seul article, appliquer une pénalité ou une vérification plus stricte.

### 4. Sources Management
- Ajouter une interface pour gérer/bannir des sources RSS directement depuis l'admin (actuellement hardcodé ou en base).
- Pondération des sources (ex: donner plus de poids à une source réputée comme "The Verge" vs un blog inconnu).

### 5. Newsletter Automation
- Générer automatiquement une newsletter hebdomadaire basée sur les "Top Clusters" de la semaine.

### 6. Clustering de Précision (V2)
**Problème** : La similarité vectorielle (Cosinus) regroupe bien par *thème* (ex: "Intelligence Artificielle") mais peine à distinguer deux *événements distincts* proches sémantiquement (ex: "Sortie de GPT-5" et "Sortie de Claude 4").

**Solutions Roadmap** :
1. **LLM Verification (Le Juge)** : Une fois qu'un cluster potentiel est trouvé par vecteur (Seuil 0.75), demander à un modèle "Fast" de confirmer : *"Ces deux articles parlent-ils exactement du même événement ? OUI/NON"*. C'est l'approche la plus fiable.
2. **Titrage Dynamique** : Ne plus utiliser le titre du premier article, mais générer un titre synthétique pour le cluster.
3. **Clustering Centroïde** : (Concept conservé) pour stabiliser le vecteur moyen du cluster.
4. **Prompt Engineering Strict** :
   - Distinction explicite entre **Thème** (interdit) et **Événement** (requis).
   - Utilisation de contraintes négatives : *"NE GROUPE PAS par thème général (ex: IA)"*.
   - Définition de "Doublons Médiatiques" pour forcer le regroupement sur le fait précis uniquement.

**Impact** : Élimination quasi-totale des clusters "Fourre-Tout".

### 7. Mode Local (LLM on-device)
**Objectif** : Utiliser un modèle local quand l'app tourne en développement pour économiser les appels API.

**Configuration cible** :
- **M4 Pro 24GB RAM** → Parfaitement adapté pour :
  - **Llama 3.1 8B** (recommandé, excellent rapport qualité/vitesse)
  - **Mistral 7B** ou **Qwen 2.5 7B** (alternatives légères)
  - **Gemma 2 9B** (bon pour le français)
  
**Implémentation** :
- Intégration avec [Ollama](https://ollama.ai) (API compatible OpenAI)
- Détection automatique si Ollama est disponible en local
- Bascule transparente local ↔ cloud selon l'environnement
- Variable `PREFER_LOCAL_LLM=true` pour forcer le mode local

**Performance estimée** :
- 8B model sur M4 Pro : ~40-60 tokens/sec (très fluide)
- Scoring batch : ~2-3 secondes/article
- Rédaction : ~10-15 secondes/article

---

## 💡 Pistes d'Inspiration (Éventuelles)

Ces idées sont notées pour référence future, sans priorité définie.

### Améliorations Rédaction IA
- **Longueur adaptative** : Adapter le nombre de paragraphes selon la richesse du contenu source
- **Attribution explicite** : Mentionner les sources dans le texte (*"Selon TechCrunch..."*) pour plus de crédibilité
- **Angle éditorial configurable** : Permettre de choisir l'angle (tech pure, business, impact utilisateur)
- **Traçabilité sources** : Ajouter un champ `sources_used` dans le JSON de sortie

### 📉 Dette Technique & Report de Chantier
Conformément aux priorités actuelles, les chantiers suivants sont **volontairement reportés** :

1.  **Tests Automatisés (Jest/Playwright)** :
    - *Pourquoi* : La logique évolue trop vite (ingestion, clustering), maintenir des tests serait contre-productif maintenant.
    - *Quand* : Une fois le moteur d'ingestion stabilisé.

2.  **Linting Strict (Code Hygiene)** :
    - *État* : ~200 warnings/erreurs (principalement des types `any`).
    - *Action* : On accepte cette dette pour garder la vélocité. À nettoyer progressivement (règle du Boy Scout).
