// Shared types for the AI evaluation returned by /api/evaluate.
// This file is imported by both the backend route and the frontend component.
// It contains no secrets and no server-only code.

export type EvaluationScores = {
  fluency: number;
  grammar: number;
  vocabulary: number;
  clarity: number;
  structure: number;
  technicalUnderstanding: number;
  reasoning: number;
  communication: number;
};

export type AIEvaluation = {
  overallScore: number;
  questionRelevance: {
    score: number;
    addressed: boolean;
    explanation: string;
  };
  scores: EvaluationScores;
  strengths: string[];
  weaknesses: string[];
  grammarCorrections: string[];
  vocabularyImprovements: string[];
  technicalFeedback: string[];
  nextRecommendation: string;
};

// ── Validation ────────────────────────────────────────────────────────────────

function isIntInRange(value: unknown, min: number, max: number): boolean {
  return typeof value === "number" && isFinite(value) && value >= min && value <= max;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/**
 * Validate that a parsed JSON value conforms to AIEvaluation.
 * Returns the typed object on success, or throws a descriptive Error.
 */
export function validateEvaluation(raw: unknown): AIEvaluation {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Response is not a JSON object.");
  }

  const obj = raw as Record<string, unknown>;

  if (!isIntInRange(obj.overallScore, 0, 100)) {
    throw new Error(`Invalid overallScore: ${String(obj.overallScore)}`);
  }

  if (typeof obj.questionRelevance !== "object" || obj.questionRelevance === null) {
    throw new Error("Missing questionRelevance object.");
  }
  const relevance = obj.questionRelevance as Record<string, unknown>;
  if (!isIntInRange(relevance.score, 0, 100)) throw new Error("Invalid question relevance score.");
  if (typeof relevance.addressed !== "boolean") throw new Error("questionRelevance.addressed must be boolean.");
  if (typeof relevance.explanation !== "string" || relevance.explanation.trim() === "") {
    throw new Error("questionRelevance.explanation must be a non-empty string.");
  }

  const scores = obj.scores;
  if (typeof scores !== "object" || scores === null) {
    throw new Error("Missing scores object.");
  }

  const s = scores as Record<string, unknown>;
  const scoreFields: (keyof EvaluationScores)[] = [
    "fluency",
    "grammar",
    "vocabulary",
    "clarity",
    "structure",
    "technicalUnderstanding",
    "reasoning",
    "communication",
  ];

  for (const field of scoreFields) {
    if (!isIntInRange(s[field], 0, 100)) {
      throw new Error(`Invalid score for ${field}: ${String(s[field])}`);
    }
  }

  if (!isStringArray(obj.strengths)) throw new Error("strengths must be a string array.");
  if (!isStringArray(obj.weaknesses)) throw new Error("weaknesses must be a string array.");
  if (!isStringArray(obj.grammarCorrections)) throw new Error("grammarCorrections must be a string array.");
  if (!isStringArray(obj.vocabularyImprovements)) throw new Error("vocabularyImprovements must be a string array.");
  if (!isStringArray(obj.technicalFeedback)) throw new Error("technicalFeedback must be a string array.");
  if (typeof obj.nextRecommendation !== "string") throw new Error("nextRecommendation must be a string.");

  return {
    overallScore: obj.overallScore as number,
    questionRelevance: {
      score: relevance.score as number,
      addressed: relevance.addressed as boolean,
      explanation: relevance.explanation as string,
    },
    scores: {
      fluency: s.fluency as number,
      grammar: s.grammar as number,
      vocabulary: s.vocabulary as number,
      clarity: s.clarity as number,
      structure: s.structure as number,
      technicalUnderstanding: s.technicalUnderstanding as number,
      reasoning: s.reasoning as number,
      communication: s.communication as number,
    },
    strengths: obj.strengths as string[],
    weaknesses: obj.weaknesses as string[],
    grammarCorrections: obj.grammarCorrections as string[],
    vocabularyImprovements: obj.vocabularyImprovements as string[],
    technicalFeedback: obj.technicalFeedback as string[],
    nextRecommendation: obj.nextRecommendation as string,
  };
}

export function isCompleteEvaluation(raw: unknown): raw is AIEvaluation {
  try {
    validateEvaluation(raw);
    return true;
  } catch {
    return false;
  }
}
