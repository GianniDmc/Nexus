/**
 * Centralized Publication Rules Configuration
 * 
 * Change these values ONCE and they apply everywhere:
 * - process/route.ts (rewriting/publishing)
 * - admin/stats/route.ts (dashboard counters)
 */

export const PUBLICATION_RULES = {
    /**
     * Minimum final_score required for an article to be published
     * Scale: 0-10, where 10 is most relevant
     */
    PUBLISH_THRESHOLD: 8.0,

    /**
     * Minimum number of unique sources required in a cluster
     * to qualify for publication (multi-source verification)
     */
    MIN_SOURCES: 2,

    /**
     * Only process clusters with at least one article younger than this
     * Set to 0 to disable freshness filter
     */
    FRESHNESS_HOURS: 48,

    /**
     * Whether freshness filter is enabled by default
     */
    FRESH_ONLY_DEFAULT: true,

    /**
     * Maximum age of articles to ingest (in hours)
     * Articles older than this will be ignored during RSS fetch
     * Default: 720 hours (30 days)
     */
    INGESTION_MAX_AGE_HOURS: 720,

    /**
     * Minimum age (in hours) of the FIRST article in a cluster 
     * before the cluster is eligible for automated rewriting/publishing.
     * Prevents premature publishing of developing stories.
     */
    CLUSTER_MATURITY_HOURS: 3,
} as const;

// Helper to get freshness cutoff date (for Rewriting)
export function getFreshnessCutoff(): string {
    if (PUBLICATION_RULES.FRESHNESS_HOURS <= 0) {
        return new Date(0).toISOString();
    }
    return new Date(Date.now() - PUBLICATION_RULES.FRESHNESS_HOURS * 60 * 60 * 1000).toISOString();
}

// Helper to get ingestion cutoff date (for RSS Fetching)
export function getIngestionCutoff(): Date {
    if (PUBLICATION_RULES.INGESTION_MAX_AGE_HOURS <= 0) {
        return new Date(0); // Very old date = no filter
    }
    return new Date(Date.now() - PUBLICATION_RULES.INGESTION_MAX_AGE_HOURS * 60 * 60 * 1000);
}

// Type for runtime overrides (from API body)
export interface PublicationOverrides {
    freshOnly?: boolean;
    minSources?: number;
    publishThreshold?: number;
    ignoreMaturity?: boolean;
}

// Merge defaults with overrides
export function getPublicationConfig(overrides?: PublicationOverrides) {
    return {
        publishThreshold: overrides?.publishThreshold ?? PUBLICATION_RULES.PUBLISH_THRESHOLD,
        minSources: overrides?.minSources ?? PUBLICATION_RULES.MIN_SOURCES,
        freshOnly: overrides?.freshOnly ?? PUBLICATION_RULES.FRESH_ONLY_DEFAULT,
        freshnessCutoff: getFreshnessCutoff(),
        ignoreMaturity: overrides?.ignoreMaturity ?? false,
        maturityHours: PUBLICATION_RULES.CLUSTER_MATURITY_HOURS,
    };
}
