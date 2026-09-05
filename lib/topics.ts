import catalog from "@/data/topics.json";

export type TopicDifficulty = "easy" | "medium" | "hard";

export type TopicType =
  | "concept"
  | "compare"
  | "why"
  | "tradeoff"
  | "design"
  | "opinion"
  | "problem-solving"
  | "interview";

export type Topic = {
  id: string;
  title: string;
  prompt: string;
  categoryId: string;
  subcategoryId: string;
  subcategory: string;
  difficulty: TopicDifficulty;
  type: TopicType;
  estimatedMinutes: number;
};

type Catalog = {
  topics: Topic[];
};

const data = catalog as Catalog;

export function getTopics(): Topic[] {
  return data.topics;
}

export function getTopicById(id: string): Topic | undefined {
  return data.topics.find((topic) => topic.id === id);
}

export function getTopicsFor(filters: {
  categoryId: string;
  difficulty?: TopicDifficulty;
}): Topic[] {
  const byCategory = data.topics.filter(
    (topic) => topic.categoryId === filters.categoryId,
  );
  if (!filters.difficulty) return byCategory;
  const byDifficulty = byCategory.filter(
    (topic) => topic.difficulty === filters.difficulty,
  );
  return byDifficulty;
}

export const TYPE_LABELS: Record<TopicType, string> = {
  concept: "Conceptual",
  compare: "Compare",
  why: "Why",
  tradeoff: "Tradeoff",
  design: "Design",
  opinion: "Opinion",
  "problem-solving": "Problem solving",
  interview: "Interview",
};
