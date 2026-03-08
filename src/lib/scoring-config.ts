/**
 * Configuration du scoring multi-critères des clusters.
 * Les poids sont ajustables sans modifier le prompt LLM.
 */

export const SCORING_CONFIG = {
  /** Version du schéma de scoring (pour traçabilité) */
  version: 2,

  /** Poids de chaque critère (doivent sommer à 1.0) */
  weights: {
    impact: 0.45,
    tech_relevance: 0.35,
    originality: 0.20,
  },

  /** Longueur max des extraits envoyés au LLM */
  excerptLength: 800,
} as const;

/** Sous-scores retournés par le LLM */
export interface ClusterSubscores {
  impact: number;
  tech_relevance: number;
  originality: number;
}

/** Détails complets stockés dans clusters.scoring_details */
export interface ScoringDetails {
  version: number;
  reasoning: string;
  subscores: ClusterSubscores;
  weighted_score: number;
}

/** Calcule le score pondéré (0-10) à partir des sous-scores */
export function computeWeightedScore(subscores: ClusterSubscores): number {
  const { weights } = SCORING_CONFIG;
  const raw =
    subscores.impact * weights.impact +
    subscores.tech_relevance * weights.tech_relevance +
    subscores.originality * weights.originality;
  return Math.round(raw * 10) / 10;
}
