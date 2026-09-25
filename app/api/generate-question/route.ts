import { NextResponse } from "next/server";
import { currentUserId, isClerkConfigured } from "@/lib/authGate";
import { validateGeneratedQuestion } from "@/lib/generatedQuestion";
import { pickTopic } from "@/lib/topicEngine";
import type { TopicDifficulty } from "@/lib/topics";

export const runtime = "nodejs";
export const maxDuration = 60;

// ── Request shape ──────────────────────────────────────────────────────────

type GenerateRequest = {
  categoryId: string;
  categoryName: string;
  difficulty: TopicDifficulty;
};

const VALID_DIFFICULTIES: TopicDifficulty[] = ["easy", "medium", "hard"];

// ── NVIDIA NIM endpoint (shared with /api/evaluate) ────────────────────────

const NVIDIA_API_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const NVIDIA_MODEL_CANDIDATES = (process.env.NVIDIA_MODEL ? [process.env.NVIDIA_MODEL] : [
  "meta/llama-3.1-70b-instruct",
  "meta/llama-3.2-11b-vision-instruct",
  "meta/llama-3.1-8b-instruct",
]);

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `You are the question designer for "SpeakLab Topic Challenge", a speaking-practice tool that helps advanced English learners improve their technical understanding, reasoning, explanation ability, and interview communication.

Your sole job is to generate a single original discussion question for the user to answer out loud.

Topic priorities (when the user picks one of these categories):
- AI Engineering: RAG, LLMs, NLP, machine learning, deep learning, AI agents, embeddings, vector search, model evaluation, AI system design, CS fundamentals (data structures, algorithms, OS, networks, distributed systems).
- Computer Science: data structures, algorithms, operating systems, networking, databases, distributed systems, architecture, complexity.
- Machine Learning / Deep Learning / NLP / RAG & LLM Systems: model families, training, evaluation, deployment, system tradeoffs.
- System Design: scalability, reliability, consistency, data flow, tradeoffs.
- Software Engineering: APIs, backend, frontend, testing, security, architecture.
- For non-technical categories (Finance, Politics, Geopolitics, Business, Psychology, History, General Knowledge): prioritize clarity, structure, reasoning, and communication.

Difficulty rules:
- "easy": a single idea, concrete, suitable for short (60–90s) answers.
- "medium": two related ideas, requires an example or tradeoff, suitable for 90–150s answers.
- "hard": open-ended, requires reasoning and an argument, suitable for 2–3 minute answers.

Strict rules:
1. Generate exactly ONE question.
2. The question must be specific to the requested category. Do NOT generate a generic or off-topic question.
3. The question must NOT be trivial, generic, or "what is X"-only at medium/hard. It must require real thinking and explanation.
4. Do NOT repeat a well-known textbook question word-for-word; reframe it.
5. Do NOT include any commentary, options, or extra text. Return ONLY a JSON object.
6. Keep the question short (5–14 words). Keep the prompt one to two sentences (≤ 40 words).
7. The JSON must use the exact required keys: question, category, difficulty, questionType.
8. The category must exactly match the requested category id, using the same normalized value as the user selected.

Required JSON structure (return ONLY this):
{
  "question": "<short question prompt, 5-14 words>",
  "category": "<requested category id>",
  "difficulty": "<easy|medium|hard>",
  "questionType": "<concept|compare|why|tradeoff|design|opinion|problem-solving|interview>",
  "prompt": "<one or two sentences telling the learner how to answer, 10-40 words>"
}`;
}

// ── User prompt ───────────────────────────────────────────────────────────────

function buildUserPrompt(req: GenerateRequest): string {
  return `CATEGORY: ${req.categoryName} (id: ${req.categoryId})
DIFFICULTY: ${req.difficulty}

Generate ONE Topic Challenge question appropriate for an English learner who chose this exact category and difficulty. Use the exact field names: question, category, difficulty, questionType, prompt. Return ONLY the JSON object.`;
}

// ── JSON extraction ───────────────────────────────────────────────────────────

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) return text.slice(start, end + 1);
  return text.trim();
}

// ── Route handler ─────────────────────────────────────────────────────────────

function getLocalQuestionFallback(categoryId: string, difficulty: TopicDifficulty) {
  const localTopic = pickTopic(categoryId, difficulty)
    ?? pickTopic(categoryId, "easy")
    ?? pickTopic(categoryId, "medium")
    ?? pickTopic(categoryId, "hard");

  if (!localTopic) {
    return null;
  }

  return validateGeneratedQuestion(localTopic, categoryId, difficulty, "local");
}

export async function POST(request: Request) {
  // Question generation is a paid API: only signed-in users may use it. The
  // response shape matches the route's existing error contract.
  if (!isClerkConfigured()) {
    return NextResponse.json(
      { error: "Accounts are not configured on this deployment. Add the Clerk keys (see README)." },
      { status: 503 },
    );
  }
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to generate questions." }, { status: 401 });
  }

  let body: GenerateRequest;
  try {
    body = (await request.json()) as GenerateRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }

  // Validate the request BEFORE checking for an API key. Previously the
  // no-key early return ran first, so malformed requests were answered with a
  // misleading 503 "NVIDIA_API_KEY is not configured" (or silently downgraded
  // to an easy question) instead of a 400 describing the actual problem.
  if (!body.categoryId || !body.categoryName) {
    return NextResponse.json(
      { error: "Missing required fields: categoryId, categoryName." },
      { status: 400 },
    );
  }
  if (!VALID_DIFFICULTIES.includes(body.difficulty)) {
    return NextResponse.json(
      { error: `Invalid difficulty: ${body.difficulty}` },
      { status: 400 },
    );
  }

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    const localFallback = getLocalQuestionFallback(body.categoryId, body.difficulty);
    return NextResponse.json(
      localFallback
        ? { question: localFallback, source: "local", model: "local-catalog" }
        : { error: `No local questions available for ${body.categoryId} at ${body.difficulty} difficulty.` },
      localFallback ? { status: 200 } : { status: 404 },
    );
  }

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(body);

  type NvidiaResponse = {
    choices?: Array<{ message?: { content?: string } }>;
  };

  let lastError = "All models failed or timed out.";

  const fallbackQuestion = getLocalQuestionFallback(body.categoryId, body.difficulty);

  for (const model of NVIDIA_MODEL_CANDIDATES) {
    console.log(`[generate-question] Trying model: ${model}`);
    let rawText: string;
    try {
      const res = await fetch(NVIDIA_API_URL, {
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
          temperature: 0.7,
          top_p: 0.9,
          max_tokens: 600,
          stream: false,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        console.warn(
          `[generate-question] ${model} returned ${String(res.status)}:`,
          errorText.slice(0, 120),
        );
        lastError = `NVIDIA returned ${String(res.status)}.${
          res.status === 401 ? " Check NVIDIA_API_KEY."
          : res.status === 429 ? " Rate limit, please wait."
          : ""
        }`;
        continue;
      }

      const data = (await res.json()) as NvidiaResponse;
      rawText = data.choices?.[0]?.message?.content ?? "";
      if (!rawText) {
        lastError = `${model} returned an empty response.`;
        continue;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[generate-question] ${model} fetch error:`, msg);
      lastError = msg.includes("AbortError") || msg.includes("abort")
        ? `${model} timed out.`
        : msg;
      continue;
    }

    try {
      const jsonText = extractJson(rawText);
      const parsed: unknown = JSON.parse(jsonText);
      const validated = validateGeneratedQuestion(
        parsed,
        body.categoryId,
        body.difficulty,
      );
      console.log(
        `[generate-question] Success with model: ${model}, id: ${validated.id}`,
      );
      return NextResponse.json({ question: validated, model });
    } catch (err) {
      console.warn(`[generate-question] ${model} parse/validate error:`, err);
      console.warn(`[generate-question] Raw output:`, rawText.slice(0, 300));
      lastError =
        err instanceof Error ? `${model}: ${err.message}` : "Invalid JSON from model.";
      continue;
    }
  }

  console.error("[generate-question] All models failed. Last error:", lastError);
  if (fallbackQuestion) {
    return NextResponse.json({ question: fallbackQuestion, source: "local", fallback: true, model: "local-fallback" });
  }
  return NextResponse.json({ error: lastError }, { status: 502 });
}
