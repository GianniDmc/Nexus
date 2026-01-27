# Synthèse Executive : Décisions d'Architecture (Janvier 2026)

**Période de référence :** 23 janvier 2026 au 27 janvier 2026
**Projet :** App Curation News Tech (Nexus)

## Introduction
Cette synthèse présente les décisions architecturales majeures prises lors de la phase de consolidation du projet Nexus. L'objectif a été de stabiliser le pipeline de traitement, d'améliorer la qualité éditoriale et de garantir la résilience du système face aux fluctuations des services tiers.

## Décisions Clés et Impacts

### 1. Adoption de Supabase comme socle Backend-as-a-Service (ADR-008)
*   **Décision :** Centralisation de la base de données, de l'authentification et des fonctions serveurs sur Supabase.
*   **Impact :** Accélération significative du déploiement. La gestion intégrée permet d'afficher en temps réel l'avancement du traitement des articles sans infrastructure complexe supplémentaire.

### 2. Architecture centrée sur les "Clusters" (ADR-005)
*   **Décision :** Pivot du modèle de données d'une approche par article vers une approche par sujet (cluster).
*   **Impact :** Simplification du flux éditorial. La publication et les synthèses sont désormais liées à l'événement traité plutôt qu'aux sources individuelles, offrant une expérience utilisateur plus cohérente et moins répétitive.

### 3. Recherche sémantique via pgvector (ADR-009)
*   **Décision :** Utilisation de l'extension `pgvector` directement au sein de PostgreSQL pour le calcul de similarité.
*   **Impact :** Efficacité opérationnelle maximale. En évitant une base de données vectorielle externe, nous simplifions la maintenance tout en permettant des recherches complexes (croisement données vectorielles et relationnelles) avec des performances optimales pour notre volume actuel.

### 4. Moteur IA Multi-Providers et Résilience (ADR-002, ADR-003)
*   **Décision :** Implémentation d'un sélecteur dynamique entre OpenAI, Anthropic et Google (Gemini), avec bascule automatique vers Gemini pour les embeddings.
*   **Impact :** Robustesse accrue. Le système ne dépend plus d'un seul fournisseur. L'utilisation de Gemini pour les embeddings a drastiquement réduit les erreurs 500 en production, garantissant la stabilité du pipeline.

### 5. Automatisation et Règles de Maturité (ADR-006)
*   **Décision :** Mise en place de tâches automatisées (crons) associées à des critères de qualité stricts avant toute publication.
*   **Impact :** Autonomie du système. La curation ne nécessite plus d'intervention manuelle constante. Les règles de maturité (nombre de sources minimum, seuils de pertinence) garantissent que seuls les sujets réellement importants sont publiés.

### 6. Harmonisation et Normalisation des Catégories (ADR-011, ADR-012)
*   **Décision :** Transformation systématique des catégories sources hétérogènes en une liste standardisée gérée par l'IA au niveau du cluster.
*   **Impact :** Clarté de l'interface. L'utilisateur bénéficie d'une navigation fluide par thématiques propres ("IA", "Mobile", "Startup"), éliminant le bruit visuel des tags originaux disparates.

### 7. Modernisation Frontend avec Next.js App Router (ADR-010)
*   **Décision :** Passage à la version 14 de Next.js avec l'architecture App Router.
*   **Impact :** Performance utilisateur. L'utilisation des Server Components réduit le poids des pages pour le navigateur, offrant un affichage ultra-rapide des flux d'actualités tout en optimisant le référencement (SEO).

### 8. Sécurisation Pragmatique de l'Espace Admin (ADR-001)
*   **Décision :** Protection des accès sensibles par une authentification simplifiée (Basic Auth) via middleware.
*   **Impact :** Sécurité immédiate. Les fonctions critiques (gestion des clés IA, suppression de données) sont protégées sans alourdir le développement, permettant de se concentrer sur les fonctionnalités métier.

## Conclusion
Les choix effectués durant cette période ont permis de transformer un prototype en une plateforme de curation robuste et automatisée. L'architecture "cluster-centric" combinée à un moteur IA résilient place Nexus dans une position idéale pour monter en charge tout en maintenant une haute qualité éditoriale.
