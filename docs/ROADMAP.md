# Roadmap Technique - App Curation News Tech

Ce document recense les améliorations techniques et fonctionnelles prévues pour le système de curation.

## 🚀 Fonctionnalités Récemment Implémentées
- [x] **Administration** : Gestionnaire d'articles avec filtres (Publiés, Prêts, etc.), Tri par Score/Date, indicateurs de réécriture IA.
- [x] **Pipeline** : Suppression des quotas de publication (Publication illimitée pour les articles pertinents).
- [x] **Clustering** : Ajustement du seuil de similarité (0.60 -> 0.75) pour un regroupement plus strict mais équilibré.
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

## 🔮 Améliorations Futures (Backlog)

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
