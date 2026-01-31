# Diagramme des États (Cluster Lifecycle)

Ce diagramme décrit le cycle de vie d'un Cluster de news, de sa création à sa publication ou son archivage.

```mermaid
stateDiagram-v2
    direction TB

    %% Initial State
    state "Pending (En Attente)" as Pending
    note right of Pending
        - Création
        - Score: NULL
    end note

    %% Scoring Process
    [*] --> Pending
    Pending --> ScoringProcess: CRON / Process Loop

    state ScoringProcess <<choice>>

    %% Scoring Outcomes
    ScoringProcess --> LowScore: Score < 8
    ScoringProcess --> PreQualified: Score >= 8

    state "Low Score (Poubelle)" as LowScore
    note right of LowScore
        - Rejet Auto
        - Fin de vie
    end note

    state "Pre-Qualified" as PreQualified {
        state "Incubating" as Inc
        state "Eligible" as Elig
        
        Inc --> Elig: + de Sources / + de Temps
    }

    PreQualified --> Archived: Timeout (> 48h)
    
    %% Eligibility Logic
    PreQualified --> RewritingProcess: Si Eligible (Maturity + MinSources)

    state "Incubating (Trop petit)" as Inc
    note left of Inc
        - Score >= 8
        - Sources < 2
        - Ou trop récent (< 6h)
    end note

    state "Eligible (Prêt pour IA)" as Elig
    note right of Elig
        - Score >= 8
        - Sources >= 2
        - Mature (> 6h)
        - Frais (< 48h)
    end note

    %% Review Process
    state "Ready (À Valider)" as Ready
    note right of Ready
        - Résumé IA généré
        - En attente humain
    end note

    RewritingProcess --> Ready: Génération OK
    Ready --> Published: Publication Manuelle ("Check")
    Ready --> Rejected: Rejet Manuel ("Croix")

    %% End States
    state "Published (En Ligne)" as Published
    state "Archived (Ratés)" as Archived
    state "Rejected (Refusé)" as Rejected

    Published --> [*]
    Archived --> [*]
    Rejected --> [*]
    LowScore --> [*]
```

## Définitions des Conditions

| État | Condition Technique | Description |
| :--- | :--- | :--- |
| **Pending** | `final_score IS NULL` | Vient d'arriver. En attente du script de scoring. |
| **Low Score** | `final_score < 8` | Jugé non pertinent par l'IA. |
| **Incubating** | `score >= 8` ET (`sources < 2` OU `age < 6h`) | Potentiel détecté, mais trop "faible" ou trop récent pour être traité. |
| **Eligible** | `score >= 8` ET `sources >= 2` ET `age > 6h` ET `age < 48h` | **La cible**. Prêt pour la génération de synthèse. |
| **Ready** | `score >= 8` ET `summary IS NOT NULL` ET `!published` | Le travail de l'IA est fini. L'humain doit valider ou rejeter. |
| **Published** | `is_published = true` | Visible sur le site. |
| **Archived** | `score >= 8` ET `!summary` ET `age > 48h` | Était bon, mais a expiré avant de devenir Eligible (manque de sources, bug). |
