import { describe, expect, it } from "vitest";
import { isCompleteEvaluation, validateEvaluation } from "../lib/aiEvaluation";

const relevance = { score: 86, addressed: true, assessed: true, explanation: "Answers the exact question." };
const scores = {
  fluency: 75, grammar: 80, vocabulary: 77, clarity: 79,
  structure: 76, technicalUnderstanding: 74, reasoning: 78, communication: 81,
};

function evaluation(overrides: Record<string, unknown> = {}) {
  return {
    overallScore: 78,
    questionRelevance: relevance,
    scores,
    strengths: ["Clear structure"],
    weaknesses: ["Few concrete examples"],
    grammarCorrections: [],
    vocabularyImprovements: [],
    technicalFeedback: [],
    nextRecommendation: "Add one concrete example.",
    ...overrides,
  };
}

describe("validateEvaluation / isCompleteEvaluation", () => {
  it("accepts a complete evaluation", () => {
    expect(isCompleteEvaluation(evaluation())).toBe(true);
    expect(validateEvaluation(evaluation()).questionRelevance).toEqual(relevance);
  });

  it("still shows evaluations saved with a decimal relevance score", () => {
    // Before PR #4 the evaluate route never rounded questionRelevance.score
    // and saved values such as 85.5. Requiring integers hid those saved
    // evaluations on My Recordings (and let a re-run overwrite them).
    const saved = evaluation({ questionRelevance: { ...relevance, score: 85.5 } });
    expect(isCompleteEvaluation(saved)).toBe(true);
    expect(validateEvaluation(saved).questionRelevance.score).toBe(85.5);
  });

  it("treats older saved evaluations without the assessed flag as assessed", () => {
    const { assessed: _assessed, ...withoutFlag } = relevance;
    void _assessed;
    const saved = evaluation({ questionRelevance: withoutFlag });
    expect(validateEvaluation(saved).questionRelevance.assessed).toBe(true);
  });

  it("keeps heuristic fallback evaluations recognisable (assessed: false)", () => {
    const heuristic = evaluation({ questionRelevance: { score: 0, addressed: false, assessed: false, explanation: "AI evaluation was unavailable." } });
    expect(validateEvaluation(heuristic).questionRelevance.assessed).toBe(false);
  });

  it.each([101, -1, -0.5, 100.5, Number.NaN, Number.POSITIVE_INFINITY, "80", null, undefined])(
    "rejects an invalid score: %s",
    (bad) => {
      expect(isCompleteEvaluation(evaluation({ overallScore: bad }))).toBe(false);
      expect(isCompleteEvaluation(evaluation({ questionRelevance: { ...relevance, score: bad } }))).toBe(false);
      expect(isCompleteEvaluation(evaluation({ scores: { ...scores, grammar: bad } }))).toBe(false);
    },
  );

  it("rejects incomplete evaluations", () => {
    expect(isCompleteEvaluation(null)).toBe(false);
    expect(isCompleteEvaluation(evaluation({ scores: { ...scores, reasoning: undefined } }))).toBe(false);
    expect(isCompleteEvaluation(evaluation({ strengths: "Clear" }))).toBe(false);
    expect(isCompleteEvaluation(evaluation({ questionRelevance: { ...relevance, explanation: " " } }))).toBe(false);
  });
});
