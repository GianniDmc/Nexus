# Registre des Décisions d'Architecture (ADR)

Ce document consigne les choix techniques structurants du projet **App Curation News Tech**. Chaque décision explique le contexte, les alternatives considérées et la raison du choix final.

## Index des Décisions

| ID | Date | Titre | Statut |
| :--- | :--- | :--- | :--- |
| ADR-001 | 2026-01-26 | Choix de Supabase comme Backend-as-a-Service | Validé |
| ADR-002 | 2026-01-26 | Utilisation de pgvector pour la recherche sémantique | Validé |
| ADR-003 | 2026-01-26 | Next.js App Router comme framework Frontend | Validé |
| ADR-004 | 2026-01-27 | Harmonisation Stricte des Catégories (Source -> IA) | Validé |
| ADR-005 | 2026-01-27 | Stockage de la Catégorie au niveau Cluster | Validé |

---

## ADR-001 : Choix de Supabase comme BaaS

### Contexte
Le projet nécessite une base de données relationnelle robuste, une authentification sécurisée et des capacités temps réel pour afficher l'avancement du processing.

### Décision
Utiliser **Supabase**.

### Conséquences
- **Positif** : Tout-en-un (Auth, DB, Realtime, Edge Functions). Hébergé, scalabilité gérée.
- **Négatif** : Vendor lock-in partiel (bien que basé sur PostgreSQL standard).

---

## ADR-002 : Utilisation de pgvector pour la recherche sémantique

### Contexte
Le cœur du système repose sur le clustering d'articles similaires et la recherche sémantique. Les bases de données vectorielles dédiées (Pinecone, Weaviate) ajoutent de la complexité infrastructurelle.

### Décision
Utiliser l'extension **pgvector** directement dans PostgreSQL (Supabase).

### Conséquences
- **Positif** : Données relationnelles et vectorielles au même endroit (JOINs possibles). Pas d'ETL complexe vers un index externe. Coût inclus dans Supabase.
- **Négatif** : Performance potentiellement inférieure à une DB vectorielle dédiée sur des volumes massifs (>10M vecteurs), mais suffisant pour notre échelle (~100k articles).

---

## ADR-003 : Next.js App Router

### Contexte
Besoin d'un framework React moderne supportant le SSR pour le SEO et les Server Components pour l'optimisation des données.

### Décision
Utiliser **Next.js 14+ avec App Router**.

### Conséquences
- **Positif** : React Server Components (RSC) réduisent le bundle JS client. Meilleure DX avec les Layouts imbriqués.
- **Négatif** : Courbe d'apprentissage vs Pages Router. Écosystème de librairies encore en transition pour certaines compatibilités RSC.

---

## ADR-004 : Harmonisation Stricte des Catégories (Source -> IA)

### Contexte
Les flux RSS sources ont des catégories hétérogènes ("Tech News", "Apple", "Device", etc.) qui polluent l'interface et perturbent le filtrage. L'IA a besoin d'un cadre pour classer efficacement.

### Décision
- **Normalisation à l'ingestion/clustering** : Transformer à la volée les catégories sources en une liste restreinte (ex: "Apple" -> "Mobile").
- **Migration Historique** : Mettre à jour les anciennes données pour correspondre à cette norme.

### Conséquences
- **Positif** : UX cohérente, filtres propres ("Mobile", "AI", "Startup"...). Facilite le travail de l'IA qui part d'une base saine.
- **Négatif** : Perte de la granularité originale de la source (ex: on perd la nuance "iPhone" vs "iPad" au profit de "Mobile"), mais acceptable pour une curation généraliste.

---

## ADR-005 : Stockage de la Catégorie au niveau Cluster

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
