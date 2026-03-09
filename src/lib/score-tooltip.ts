import type { ScoringDetails } from './scoring-config';

type ScoreSubscores = Partial<ScoringDetails['subscores']>;

export type ScoreDetailsLike = Partial<Omit<ScoringDetails, 'subscores'>> & {
  subscores?: ScoreSubscores;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return undefined;
}

export function parseScoreDetails(raw: unknown): ScoreDetailsLike | null {
  let parsed: unknown = raw;

  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }

  if (!isRecord(parsed)) return null;

  const maybeSubscores = isRecord(parsed.subscores) ? parsed.subscores : null;
  const subscores: ScoreSubscores | undefined = maybeSubscores
    ? {
      impact: toFiniteNumber(maybeSubscores.impact),
      tech_relevance: toFiniteNumber(maybeSubscores.tech_relevance),
      originality: toFiniteNumber(maybeSubscores.originality),
    }
    : undefined;

  return {
    version: toFiniteNumber(parsed.version),
    reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : undefined,
    weighted_score: toFiniteNumber(parsed.weighted_score),
    subscores,
  };
}

function toLine(label: string, value: number | undefined): string | null {
  if (typeof value !== 'number') return null;
  return `${label}: ${value.toFixed(1)}/10`;
}

export function buildScoreTooltip(score: number | null | undefined, details: unknown): string {
  const detailsParsed = parseScoreDetails(details);

  if (!detailsParsed) {
    if (typeof score === 'number') return `Score global: ${score.toFixed(1)}/10`;
    return 'Score non calculé';
  }

  const weighted = typeof score === 'number' ? score : detailsParsed.weighted_score;
  const lines: string[] = [];

  if (typeof weighted === 'number') {
    lines.push(`Score global: ${weighted.toFixed(1)}/10`);
  } else {
    lines.push('Score global: non calculé');
  }

  const scoreLines = [
    toLine('Impact', detailsParsed.subscores?.impact),
    toLine('Pertinence tech', detailsParsed.subscores?.tech_relevance),
    toLine('Originalité', detailsParsed.subscores?.originality),
  ].filter((line): line is string => line !== null);

  lines.push(...scoreLines);

  if (detailsParsed.reasoning) {
    const compactReasoning = detailsParsed.reasoning.replace(/\s+/g, ' ').trim();
    if (compactReasoning.length > 0) {
      lines.push('');
      lines.push(`Note IA: ${compactReasoning}`);
    }
  }

  return lines.join('\n');
}
