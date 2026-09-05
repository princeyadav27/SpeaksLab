// Shared types and validator for AI-generated Topic Challenge questions.
// Imported by the /api/generate-question backend route and by the frontend
// when it uses the returned question. Holds no secrets.

import type { Topic, TopicDifficulty, TopicType } from "./topics";

export type GeneratedQuestion = Topic & {
  source: "ai" | "local";
  question?: string;
  category?: string;
  questionType?: TopicType;
};

export type QuestionSource = GeneratedQuestion["source"];

// ── Validation ────────────────────────────────────────────────────────────────

const VALID_DIFFICULTIES: TopicDifficulty[] = ["easy", "medium", "hard"];
const VALID_TYPES: TopicType[] = [
  "concept",
  "compare",
  "why",
  "tradeoff",
  "design",
  "opinion",
  "problem-solving",
  "interview",
];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normaliseId(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80) || "ai-question";
}

function normalizeCategoryValue(raw: string, expectedCategoryId: string): string {
  const normalizedRequested = expectedCategoryId.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const normalizedIncoming = raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");

  if (!normalizedIncoming) return expectedCategoryId;
  if (
    normalizedIncoming === normalizedRequested ||
    normalizedIncoming.includes(normalizedRequested) ||
    normalizedRequested.includes(normalizedIncoming)
  ) {
    return expectedCategoryId;
  }

  return expectedCategoryId;
}

/**
 * Validate and normalise a parsed JSON value into a GeneratedQuestion.
 * Throws on any invalid field. The categoryId is forced to the
 * `expectedCategoryId` so a misbehaving model can't put a question into
 * the wrong category. Difficulty is also clamped to the requested level.
 *
 * `source` records where the question really came from. It defaults to "ai"
 * but MUST be passed as "local" when a catalog topic is run through this
 * validator — otherwise the local fallback reports itself as AI-generated.
 */
export function validateGeneratedQuestion(
  raw: unknown,
  expectedCategoryId: string,
  expectedDifficulty: TopicDifficulty,
  source: GeneratedQuestion["source"] = "ai",
): GeneratedQuestion {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Response is not a JSON object.");
  }
  const obj = raw as Record<string, unknown>;

  const title = isNonEmptyString(obj.title)
    ? obj.title.trim()
    : isNonEmptyString(obj.question)
      ? obj.question.trim()
      : "";
  if (!title) throw new Error("Missing question title.");

  const prompt = isNonEmptyString(obj.prompt)
    ? obj.prompt.trim()
    : isNonEmptyString(obj.followup)
      ? obj.followup.trim()
      : isNonEmptyString(obj.question)
        ? obj.question.trim()
        : "";
  if (!prompt) {
    throw new Error("Missing question prompt.");
  }

  const categoryField = isNonEmptyString(obj.category)
    ? obj.category.trim()
    : isNonEmptyString(obj.categoryId)
      ? obj.categoryId.trim()
      : expectedCategoryId;
  const categoryId = normalizeCategoryValue(categoryField, expectedCategoryId);

  const difficultyInput =
    typeof obj.difficulty === "string"
      ? obj.difficulty
      : typeof obj.questionDifficulty === "string"
        ? obj.questionDifficulty
        : expectedDifficulty;
  const difficulty = VALID_DIFFICULTIES.includes(
    difficultyInput as TopicDifficulty,
  )
    ? (difficultyInput as TopicDifficulty)
    : expectedDifficulty;

  const typeInput = isNonEmptyString(obj.questionType)
    ? obj.questionType
    : isNonEmptyString(obj.type)
      ? obj.type
      : "concept";
  const type = VALID_TYPES.includes(typeInput as TopicType)
    ? (typeInput as TopicType)
    : "concept";

  // Length sanity: prevent runaway questions breaking the UI.
  const safeTitle = clamp(title.length, 1, 200) === title.length ? title : title.slice(0, 200);
  const safePrompt = clamp(prompt.length, 1, 600) === prompt.length ? prompt : prompt.slice(0, 600);

  const id = isNonEmptyString(obj.id)
    ? normaliseId(obj.id)
    : `ai-${normaliseId(safeTitle)}-${Date.now().toString(36)}`;

  const question = safeTitle;
  const questionType = type;

  return {
    id,
    title: safeTitle,
    prompt: safePrompt,
    question,
    category: categoryId,
    questionType,
    categoryId,
    subcategoryId: "ai-generated",
    subcategory: "AI generated",
    difficulty,
    type,
    estimatedMinutes:
      difficulty === "easy" ? 1 : difficulty === "medium" ? 2 : 3,
    source,
  };
}
