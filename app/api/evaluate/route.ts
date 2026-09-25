import { NextResponse } from "next/server";
import { currentUserId, isClerkConfigured } from "@/lib/authGate";
import { validateEvaluation, type AIEvaluation } from "@/lib/aiEvaluation";
import type { SpeakingMetrics } from "@/lib/speakingMetrics";

export const runtime = "nodejs";
export const maxDuration = 120;

// ── Request shape ─────────────────────────────────────────────────────────────

type EvaluateRequest = {
  category: string;
  challengeQuestion: string;
  topicTitle: string;
  topicPrompt: string;
  topicType: string;
  difficulty: string;
  transcript: string;
  metrics: SpeakingMetrics;
};

// ── NVIDIA NIM endpoint ───────────────────────────────────────────────────────

const NVIDIA_API_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
// Ordered by preference; first one that responds successfully is used.
// 90b is higher quality but sometimes slow; 11b is the reliable fallback.
const NVIDIA_MODEL_CANDIDATES = (process.env.NVIDIA_MODEL ? [process.env.NVIDIA_MODEL] : [
  "meta/llama-3.1-70b-instruct",
  "meta/llama-3.2-11b-vision-instruct",
  "meta/llama-3.1-8b-instruct",
]);

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `You are an expert English speaking coach evaluating a learner's spoken response.
You will receive:
- The exact challenge question the learner was asked to answer
- The topic metadata for that question
- The category and difficulty of the topic
- The type of question (concept, compare, opinion, design, tradeoff, why, problem-solving, interview)
- A transcript of what the learner said (produced by Whisper speech recognition)
- Objective speaking metrics (word count, WPM, filler words, repeated words)

Your job is to evaluate this specific response against the exact challenge question, then assess it across 8 speaking dimensions and return a JSON object.
Ground every comment in the supplied transcript, topic, and speaking metrics. Grammar and vocabulary feedback must reference the learner's actual wording; never invent an error that is not present.
If the transcript is too short or does not provide evidence for a category, say so clearly in the relevant array instead of inventing feedback.
Technical feedback must address the actual topic and claims in the response, not generic coaching advice.
First determine whether the transcript answers the exact challenge question. Explain which parts of the answer address or fail to address the question, and score that relevance separately. Do not rewrite, improve, or replace the challenge question.
You MUST respond with ONLY valid JSON — no markdown fences, no commentary, no preamble.

Evaluation dimensions (score 0–100 each):
- fluency: natural flow, pace, and delivery (infer from transcript rhythm and filler words)
- grammar: correctness of sentence structure
- vocabulary: range and appropriateness of word choice
- clarity: how clearly the ideas are expressed
- structure: logical organisation — opening, body, conclusion
- technicalUnderstanding: depth of domain knowledge (weight heavily for technical topics; moderate for general)
- reasoning: quality of arguments and logical thinking
- communication: overall effectiveness as a communicator

Scoring guidance:
- 0–39: Poor. Major gaps, hard to follow.
- 40–59: Developing. Some good moments but significant weaknesses.
- 60–74: Competent. Mostly clear with noticeable weaknesses.
- 75–89: Good. Clear, well-structured, minor issues.
- 90–100: Excellent. Near-native fluency and depth.

overallScore = weighted average of the 8 dimension scores (round to nearest integer).

Required JSON structure (return ONLY this, nothing else):
{
  "overallScore": <integer 0-100>,
  "questionRelevance": {
    "score": <integer 0-100>,
    "addressed": <true|false>,
    "explanation": "<specific explanation based on the question and transcript>"
  },
  "scores": {
    "fluency": <integer 0-100>,
    "grammar": <integer 0-100>,
    "vocabulary": <integer 0-100>,
    "clarity": <integer 0-100>,
    "structure": <integer 0-100>,
    "technicalUnderstanding": <integer 0-100>,
    "reasoning": <integer 0-100>,
    "communication": <integer 0-100>
  },
  "strengths": [<2-3 specific, actionable strings>],
  "weaknesses": [<2-3 specific, actionable strings>],
  "grammarCorrections": [<0-4 strings, each showing the error and the correction, e.g. "Said: X → Should be: Y">],
  "vocabularyImprovements": [<0-4 strings, each showing a weaker word and a stronger alternative, e.g. "good → precise">],
  "technicalFeedback": [<0-4 strings of domain-specific feedback; empty array for non-technical topics>],
  "nextRecommendation": "<one specific, concrete action for the learner's next practice session>"
}`;
}

// ── User prompt ───────────────────────────────────────────────────────────────

function buildUserPrompt(req: EvaluateRequest): string {
  const fillerSummary =
    req.metrics.fillerWordCount > 0
      ? req.metrics.fillerWords
          .slice(0, 5)
          .map((f) => `"${f.word}" ×${f.count}`)
          .join(", ")
      : "none detected";

  const repeatedSummary =
    req.metrics.repeatedWords.length > 0
      ? req.metrics.repeatedWords
          .slice(0, 5)
          .map((r) => `"${r.word}" ×${r.count}`)
          .join(", ")
      : "none";

  const wpm =
    req.metrics.wordsPerMinute !== null
      ? `${req.metrics.wordsPerMinute} WPM`
      : "unknown";

  const durationMin = Math.floor(req.metrics.durationSeconds / 60);
  const durationSec = req.metrics.durationSeconds % 60;
  const durationStr =
    durationMin > 0
      ? `${durationMin}m ${durationSec}s`
      : `${durationSec}s`;

  return `ORIGINAL CHALLENGE QUESTION (evaluate against this exact question; do not replace it)
${req.challengeQuestion}

TOPIC INFORMATION
Category: ${req.category}
Difficulty: ${req.difficulty}
Question type: ${req.topicType}
Topic: ${req.topicTitle}
Prompt given to the learner: ${req.topicPrompt}

SPEAKING METRICS (measured objectively)
Speaking duration: ${durationStr}
Total words: ${req.metrics.wordCount}
Speaking pace: ${wpm}
Sentences: ${req.metrics.sentenceCount}
Filler words (${req.metrics.fillerWordCount} total): ${fillerSummary}
Repeated content words: ${repeatedSummary}

TRANSCRIPT (verbatim from Whisper, may contain minor recognition errors)
---
${req.transcript.trim() || "(no speech detected)"}
---

Evaluate this response and return ONLY the JSON object described in the system prompt.`;
}

// ── JSON extraction ───────────────────────────────────────────────────────────

/**
 * Extract the first complete JSON object from the model's raw text output.
 * Handles cases where the model wraps JSON in markdown fences despite instructions.
 */
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();

  // Models sometimes add a short sentence after the JSON. Find the matching
  // closing brace instead of using the last brace in the whole response.
  const start = text.indexOf("{");
  if (start < 0) return text.trim();
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (escaped) { escaped = false; continue; }
    if (char === "\\" && inString) { escaped = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (char === "{") depth += 1;
    if (char === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  return text.slice(start).trim();
}

function coerceModelEvaluation(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const value = raw as Record<string, unknown>;
  const scores = typeof value.scores === "object" && value.scores !== null
    ? { ...(value.scores as Record<string, unknown>) }
    : value.scores;
  const toInteger = (item: unknown) => {
    if (typeof item === "number") return Math.round(item);
    if (typeof item === "string" && item.trim() !== "") return Math.round(Number(item));
    return item;
  };
  if (scores && typeof scores === "object") {
    for (const key of ["fluency", "grammar", "vocabulary", "clarity", "structure", "technicalUnderstanding", "reasoning", "communication"]) {
      (scores as Record<string, unknown>)[key] = toInteger((scores as Record<string, unknown>)[key]);
    }
  }
  // Round the relevance score like every other score, so a decimal from the
  // model (e.g. 85.5) is stored as an integer instead of failing validation
  // and silently falling back to the heuristic evaluation.
  const questionRelevance = typeof value.questionRelevance === "object" && value.questionRelevance !== null
    ? { ...(value.questionRelevance as Record<string, unknown>) }
    : value.questionRelevance;
  if (questionRelevance && typeof questionRelevance === "object") {
    const relevance = questionRelevance as Record<string, unknown>;
    relevance.score = toInteger(relevance.score);
  }
  return { ...value, overallScore: toInteger(value.overallScore), questionRelevance, scores };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buildLocalEvaluationFallback(req: EvaluateRequest): AIEvaluation {
  const transcript = req.transcript.trim();
  const wordCount = Math.max(1, req.metrics.wordCount || transcript.split(/\s+/).filter(Boolean).length);
  const fillerCount = req.metrics.fillerWordCount ?? 0;
  const repeatedWords = req.metrics.repeatedWords?.length ?? 0;
  const sentenceCount = Math.max(1, req.metrics.sentenceCount || transcript.split(/[.!?]+/).filter(Boolean).length || 1);

  const qualityBase = 72;
  const wordBonus = wordCount >= 50 ? 12 : wordCount >= 25 ? 7 : 3;
  const fillerPenalty = fillerCount * 6;
  const repetitionPenalty = repeatedWords * 4;
  const sentenceBonus = sentenceCount >= 2 ? 6 : 2;
  const total = clamp(qualityBase + wordBonus - fillerPenalty - repetitionPenalty + sentenceBonus, 25, 96);

  const scores = {
    fluency: clamp(total - 6 + (fillerCount > 0 ? -4 : 2), 0, 100),
    grammar: clamp(total - 2, 0, 100),
    vocabulary: clamp(total + 2 - (wordCount < 20 ? 8 : 0), 0, 100),
    clarity: clamp(total - 1 - (fillerCount > 0 ? 3 : 0), 0, 100),
    structure: clamp(total + 1 - (sentenceCount < 2 ? 10 : 0), 0, 100),
    technicalUnderstanding: clamp(total + (req.category.toLowerCase().includes("engineering") || req.category.toLowerCase().includes("science") ? 5 : 0) - (wordCount < 20 ? 7 : 0), 0, 100),
    reasoning: clamp(total - 4 + (req.topicType === "why" || req.topicType === "tradeoff" || req.topicType === "design" ? 6 : 0), 0, 100),
    communication: clamp(total - 3 + (wordCount >= 25 ? 4 : 0), 0, 100),
  };

  const overallScore = Math.round(
    (scores.fluency + scores.grammar + scores.vocabulary + scores.clarity + scores.structure + scores.technicalUnderstanding + scores.reasoning + scores.communication) / 8,
  );

  const strengths = [
    `You answered the topic with a clear attempt to explain your idea.`,
    `Your response showed a usable level of structure and continuity.`,
    `You chose relevant vocabulary for the topic and kept the explanation focused.`,
  ].slice(0, 3);

  const weaknesses = [
    fillerCount > 0 ? `Filler words appeared ${String(fillerCount)} times; reducing them would improve fluency.` : "Your response was smooth, but a few more precise phrases could strengthen clarity.",
    repeatedWords > 0 ? "Repeated wording made the answer feel less polished than it could be." : "A few more specific examples would make the explanation feel stronger.",
    "Adding a clearer opening and closing sentence would make the answer easier to follow.",
  ];

  const grammarCorrections = [] as string[];
  const vocabularyImprovements = [] as string[];
  const technicalFeedback = req.category.toLowerCase().includes("engineering") || req.category.toLowerCase().includes("science") || req.category.toLowerCase().includes("machine") || req.category.toLowerCase().includes("ai")
    ? [
        "Try connecting your explanation to a concrete example or system tradeoff.",
        "Use more precise technical language to show depth and confidence.",
      ]
    : [];

  return {
    overallScore,
    questionRelevance: {
      // Score 0 with assessed:false means "not measured". The UI must not
      // render this as a genuine 0/100 relevance score.
      score: 0,
      addressed: false,
      assessed: false,
      explanation:
        "AI evaluation was unavailable, so question relevance could not be measured. The dimension scores below are heuristic estimates from your speaking metrics only.",
    },
    scores,
    strengths,
    weaknesses,
    grammarCorrections,
    vocabularyImprovements,
    technicalFeedback,
    nextRecommendation: "Practice by giving one clear example and one short tradeoff or reason to make your next answer more specific.",
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  // Evaluation is a paid API: only signed-in users may use it. The response
  // shape matches the route's existing error contract.
  if (!isClerkConfigured()) {
    return NextResponse.json(
      { error: "Accounts are not configured on this deployment. Add the Clerk keys (see README)." },
      { status: 503 },
    );
  }
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to get an AI evaluation." }, { status: 401 });
  }

  // Parse and validate BEFORE the no-key early return. Otherwise a malformed
  // request was answered with a 200 and a fabricated local-fallback score,
  // and an empty transcript looked like a real evaluation.
  let body: EvaluateRequest;
  try {
    body = (await request.json()) as EvaluateRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  // Basic input validation. Reject non-object JSON before dereferencing it;
  // this endpoint is public and malformed requests must return 400, not 500.
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }
  if (!body.transcript || body.transcript.trim().length === 0) {
    return NextResponse.json(
      { error: "Transcript is empty — nothing to evaluate." },
      { status: 400 },
    );
  }
  if (!body.topicTitle || !body.category || !body.metrics) {
    return NextResponse.json(
      { error: "Missing required fields: topicTitle, category, or metrics." },
      { status: 400 },
    );
  }
  if (
    typeof body.metrics !== "object" ||
    !Array.isArray(body.metrics.fillerWords) ||
    !Array.isArray(body.metrics.repeatedWords) ||
    !body.metrics.fillerWords.every((item) => item && typeof item.word === "string" && Number.isFinite(item.count)) ||
    !body.metrics.repeatedWords.every((item) => item && typeof item.word === "string" && Number.isFinite(item.count)) ||
    typeof body.metrics.wordCount !== "number" ||
    typeof body.metrics.sentenceCount !== "number" ||
    typeof body.metrics.durationSeconds !== "number" ||
    !Number.isFinite(body.metrics.wordCount) ||
    !Number.isFinite(body.metrics.sentenceCount) ||
    !Number.isFinite(body.metrics.durationSeconds)
  ) {
    return NextResponse.json({ error: "Invalid speaking metrics." }, { status: 400 });
  }

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    const fallback = buildLocalEvaluationFallback(body);
    return NextResponse.json(
      { evaluation: fallback, source: "local-fallback", model: "local-fallback" },
      { status: 200 },
    );
  }

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(body);

  type NvidiaResponse = {
    choices?: Array<{ message?: { content?: string } }>;
  };

  // Try each model candidate in order until one succeeds
  let lastError = "All models failed or timed out.";

  for (const model of NVIDIA_MODEL_CANDIDATES) {
    console.log(`[evaluate] Trying model: ${model}`);
    let rawText: string;

    try {
      const nvidiaResponse = await fetch(NVIDIA_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.2,
          top_p: 0.7,
          max_tokens: 900,
          response_format: { type: "json_object" },
          stream: false,
        }),
        // Bound provider latency. The local fallback is preferable to
        // keeping a serverless request open for several minutes.
        signal: AbortSignal.timeout(20_000),
      });

      if (!nvidiaResponse.ok) {
        const errorText = await nvidiaResponse.text().catch(() => "");
        console.warn(`[evaluate] ${model} returned ${String(nvidiaResponse.status)}:`, errorText.slice(0, 120));
        lastError = `NVIDIA API returned ${String(nvidiaResponse.status)}.${
          nvidiaResponse.status === 401 ? " Check NVIDIA_API_KEY."
          : nvidiaResponse.status === 429 ? " Rate limit — please wait."
          : ""
        }`;
        continue; // try next model
      }

      const nvidiaData = (await nvidiaResponse.json()) as NvidiaResponse;
      rawText = nvidiaData.choices?.[0]?.message?.content ?? "";

      if (!rawText) {
        lastError = `${model} returned an empty response.`;
        continue;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[evaluate] ${model} fetch error:`, msg);
      lastError = msg.includes("AbortError") || msg.includes("abort") ? `${model} timed out.` : msg;
      continue;
    }

    // Parse and validate the JSON the model returned
    try {
      const jsonText = extractJson(rawText);
      const parsed: unknown = JSON.parse(jsonText);
      const evaluation = validateEvaluation(coerceModelEvaluation(parsed));
      console.log(`[evaluate] Success with model: ${model}, overallScore: ${evaluation.overallScore}`);
      return NextResponse.json({ evaluation, model });
    } catch (err) {
      console.warn(`[evaluate] ${model} parse/validate error:`, err);
      console.warn(`[evaluate] Raw output:`, rawText.slice(0, 300));
      lastError = err instanceof Error ? `${model}: ${err.message}` : "Invalid JSON from model.";
      continue;
    }
  }

  // All models failed
  console.error("[evaluate] All models failed. Last error:", lastError);
  const fallbackEvaluation = buildLocalEvaluationFallback(body);
  return NextResponse.json({ evaluation: fallbackEvaluation, source: "local-fallback", model: "local-fallback" }, { status: 200 });
}
