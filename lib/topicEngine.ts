import {
  getTopicsFor,
  type Topic,
  type TopicDifficulty,
} from "@/lib/topics";

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function pickTopic(
  categoryId: string,
  difficulty: TopicDifficulty,
  excludedTopicId?: string | null,
): Topic | null {
  const pool = getTopicsFor({ categoryId, difficulty });
  if (pool.length === 0) return null;

  const available = excludedTopicId
    ? pool.filter((topic) => topic.id !== excludedTopicId)
    : pool;
  const candidates = available.length > 0 ? available : pool;
  return candidates[Math.floor(Math.random() * candidates.length)] ?? null;
}

export function buildSpinSequence(
  categoryId: string,
  difficulty: TopicDifficulty,
  finalTopic: Topic,
  length = 16,
): Topic[] {
  const filteredPool = getTopicsFor({ categoryId, difficulty });
  const safePool = filteredPool.length > 0 ? filteredPool : [finalTopic];

  const others = shuffle(safePool);
  const sequence: Topic[] = [];

  for (let i = 0; i < Math.max(length - 1, 1); i += 1) {
    sequence.push(others[i % others.length]);
  }
  sequence.push(finalTopic);
  return sequence;
}

export function spinDelays(count: number, durationMs = 2600): number[] {
  if (count <= 0) return [];
  if (count === 1) return [durationMs];

  const intervals: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1);
    intervals.push(2.4 + t * t * 7);
  }
  const sum = intervals.reduce((total, value) => total + value, 0);
  const delays: number[] = [];
  let elapsed = 0;
  for (const weight of intervals) {
    elapsed += (weight / sum) * durationMs;
    delays.push(Math.round(elapsed));
  }
  delays[delays.length - 1] = durationMs;
  return delays;
}
