# Roadmap Technique - App Curation News Tech

Ce document recense les améliorations techniques et fonctionnelles prévues pour le système de curation.

## 🚀 Fonctionnalités Récemment Implémentées
- [x] **Administration** : Gestionnaire d'articles avec filtres (Publiés, Prêts, etc.), Tri par Score/Date, indicateurs de réécriture IA.
- [x] **Pipeline** : Suppression des quotas de publication (Publication illimitée pour les articles pertinents).
- [x] **Clustering** : Ajustement du seuil de similitude (0.85 -> 0.78) pour un meilleur regroupement.

## 🔮 Améliorations Futures (Backlog)

### 1. Live Cluster Updates (Mise à jour incrémentale)
**Problème** : Actuellement, une fois qu'un cluster est publié (article synthétisé), il est "verrouillé". Si une nouvelle source majeure (ex: TechCrunch) publie une info cruciale 1 heure plus tard, elle rejoint le cluster mais le résumé en ligne n'est pas mis à jour.
**Solution** :
- Détecter l'ajout d'un article à fort score (> 7/10) dans un cluster déjà publié.
- Déclencher une nouvelle synthèse (Rewrite) incluant cette nouvelle source.
- Mettre à jour l'article publié avec mention "Mise à jour".

### 2. Advanced Consensus Scoring
**Problème** : Le scoring est individuel. Un article clickbait ou mal interprété par l'IA peut obtenir une bonne note isolée et déclencher une publication non méritée.
**Solution** :
- Ne pas se fier à une seule note.
- Calculer un "Score de Cluster" basés sur la moyenne pondérée des 3 meilleurs articles du groupe.
- Si le cluster ne contient qu'un seul article, appliquer une pénalité ou une vérification plus stricte.

### 3. Sources Management
- Ajouter une interface pour gérer/bannir des sources RSS directement depuis l'admin (actuellement hardcodé ou en base).
- Pondération des sources (ex: donner plus de poids à une source réputée comme "The Verge" vs un blog inconnu).

### 4. Newsletter Automation
- Générer automatiquement une newsletter hebdomadaire basée sur les "Top Clusters" de la semaine.
