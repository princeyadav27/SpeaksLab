import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The route imports "@/lib/aiEvaluation"; map the alias to the real module.
vi.mock("@/lib/aiEvaluation", () => import("../lib/aiEvaluation"));

const requestBody = {
  category: "Geopolitics",
  challengeQuestion: "What is a supply chain, and why did everyone start caring about it in 2020?",
  topicTitle: "Supply chains",
  topicPrompt: "Explain supply chains",
  topicType: "concept",
  difficulty: "easy",
  transcript: "A supply chain moves raw materials to factories and products to customers. In 2020 lockdowns disrupted it.",
  metrics: {
    durationSeconds: 20, wordCount: 20, wordsPerMinute: 60, sentenceCount: 2,
    fillerWordCount: 0, fillerWords: [], repeatedWords: [],
  },
};

function modelEvaluation(relevanceScore: unknown) {
  return {
    overallScore: 78.4,
    questionRelevance: { score: relevanceScore, addressed: true, explanation: "Covers what a supply chain is and the 2020 disruption." },
    scores: {
      fluency: 75, grammar: 80, vocabulary: 77, clarity: 79,
      structure: 76, technicalUnderstanding: 74, reasoning: 78, communication: 81,
    },
    strengths: ["Clear definition"],
    weaknesses: ["Few examples"],
    grammarCorrections: [],
    vocabularyImprovements: [],
    technicalFeedback: [],
    nextRecommendation: "Add a concrete 2020 example.",
  };
}

function nvidiaReply(content: unknown) {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function evaluate() {
  const { POST } = await import("../app/api/evaluate/route");
  const response = await POST(new Request("http://localhost/api/evaluate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(requestBody),
  }));
  return { status: response.status, body: await response.json() };
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NVIDIA_API_KEY", "test-key");
  vi.stubEnv("NVIDIA_MODEL", "");
  for (const method of ["log", "warn", "error"] as const) vi.spyOn(console, method).mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/evaluate model output handling", () => {
  it("keeps the AI evaluation when the model scores relevance with a decimal", async () => {
    // Regression: a relevance score such as 85.5 failed validation, so the
    // route discarded a good AI evaluation and returned the heuristic one.
    const fetchMock = vi.fn(async () => nvidiaReply(modelEvaluation(85.5)));
    vi.stubGlobal("fetch", fetchMock);

    const { status, body } = await evaluate();

    expect(status).toBe(200);
    expect(body.source).toBeUndefined();
    expect(body.evaluation.overallScore).toBe(78);
    expect(body.evaluation.questionRelevance).toMatchObject({ score: 86, addressed: true, assessed: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("still rejects out-of-range model scores and falls back locally", async () => {
    const fetchMock = vi.fn(async () => nvidiaReply(modelEvaluation(150)));
    vi.stubGlobal("fetch", fetchMock);

    const { status, body } = await evaluate();

    expect(status).toBe(200);
    expect(body.source).toBe("local-fallback");
    expect(body.evaluation.questionRelevance.assessed).toBe(false);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1); // every model candidate was tried
  });
});
