# Diagramme des États (Editorial State Machine)

Ce document décrit la machine à états utilisée partout dans l'admin:
- `/api/admin/articles` (tabs éditoriales),
- `/api/admin/stats` (dashboard et réconciliation),
- `runProcess()` étape rewriting (`/api/process`).

La source unique est `src/lib/editorial-state.ts`.

```mermaid
stateDiagram-v2
    direction TB

    [*] --> PendingScoring

    state "pending_scoring" as PendingScoring
    state "low_score" as LowScore
    state "anomaly_empty" as AnomalyEmpty
    state "anomaly_summary_unpublished" as AnomalySummaryUnpublished
    state "archived" as Archived
    state "incubating_maturity_sources" as IncubatingBoth
    state "incubating_maturity" as IncubatingMaturity
    state "incubating_sources" as IncubatingSources
    state "eligible_rewriting" as EligibleRewriting
    state "published" as Published

    PendingScoring --> LowScore: final_score < minScore
    PendingScoring --> AnomalyEmpty: score OK + article_count = 0
    PendingScoring --> AnomalySummaryUnpublished: score OK + has_summary
    PendingScoring --> Archived: score OK + freshOnly + !has_fresh_article
    PendingScoring --> IncubatingBoth: score OK + !mature + sources < minSources
    PendingScoring --> IncubatingMaturity: score OK + !mature + sources >= minSources
    PendingScoring --> IncubatingSources: score OK + mature + sources < minSources
    PendingScoring --> EligibleRewriting: score OK + mature + sources >= minSources + fresh

    IncubatingBoth --> IncubatingMaturity: sources >= minSources
    IncubatingBoth --> IncubatingSources: mature
    IncubatingMaturity --> EligibleRewriting: mature
    IncubatingSources --> EligibleRewriting: sources >= minSources

    IncubatingBoth --> Archived: freshness expirée
    IncubatingMaturity --> Archived: freshness expirée
    IncubatingSources --> Archived: freshness expirée
    EligibleRewriting --> Archived: freshness expirée

    EligibleRewriting --> Published: rewrite + summary OK + is_published=true

    LowScore --> [*]
    AnomalyEmpty --> [*]
    AnomalySummaryUnpublished --> [*]
    Archived --> [*]
    Published --> [*]
```

## Définitions Techniques

| État | Condition |
| :--- | :--- |
| `pending_scoring` | `final_score IS NULL` |
| `low_score` | `final_score < minScore` |
| `anomaly_empty` | `final_score >= minScore` ET `article_count = 0` |
| `anomaly_summary_unpublished` | `final_score >= minScore` ET `has_summary = true` ET `is_published = false` |
| `archived` | `final_score >= minScore` ET `freshOnly = true` ET `has_fresh_article = false` |
| `incubating_maturity_sources` | `final_score >= minScore` ET `!is_mature` ET `unique_sources < minSources` |
| `incubating_maturity` | `final_score >= minScore` ET `!is_mature` ET `unique_sources >= minSources` |
| `incubating_sources` | `final_score >= minScore` ET `is_mature` ET `unique_sources < minSources` |
| `eligible_rewriting` | `final_score >= minScore` ET `is_mature` ET `unique_sources >= minSources` ET `has_fresh_article = true` (si `freshOnly`) |
| `published` | `is_published = true` |

## Règle de Maturité

Ancre de maturité:
1. `oldest_article.published_at` (premier article du cluster),
2. fallback `clusters.created_at` si les `published_at` sont absents.

Cette règle permet de mesurer l'âge réel du sujet, pas l'heure de création technique du cluster.

## Mapping Onglets (UI Éditoriale)

| Onglet | États inclus |
| :--- | :--- |
| File d'attente | `eligible_rewriting` |
| Attente maturité | `incubating_maturity` |
| Attente sources | `incubating_sources`, `incubating_maturity_sources` |
| En attente scoring | `pending_scoring` |
| Publiés | `published` |
| Archives | `archived` |
| Faible intérêt | `low_score` |
| Anomalies | `anomaly_empty`, `anomaly_summary_unpublished` |
