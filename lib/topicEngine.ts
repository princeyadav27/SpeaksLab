import {
  getTopics,
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

/**
 * Pick the topic the wheel will land on, from the selected category and
 * difficulty only — the landing question always matches the user's choice.
 *
 * `excludedTopicIds` is the session history of recently landed topics. Those
 * are skipped so consecutive spins keep producing a new question. If the
 * history ever covers the whole pool the filter is relaxed rather than
 * returning nothing, so a spin can never fail or block.
 */
export function pickTopic(
  categoryId: string,
  difficulty: TopicDifficulty,
  excludedTopicIds?: readonly string[] | null,
): Topic | null {
  const pool = getTopicsFor({ categoryId, difficulty });
  if (pool.length === 0) return null;

  const excluded = new Set(excludedTopicIds ?? []);
  const available = excluded.size > 0
    ? pool.filter((topic) => !excluded.has(topic.id))
    : pool;
  const candidates = available.length > 0 ? available : pool;
  return candidates[Math.floor(Math.random() * candidates.length)] ?? null;
}

/**
 * Build the list of topics the wheel cycles through while spinning.
 *
 * Decoys are drawn from the ENTIRE catalog rather than the selected
 * category + difficulty. Most category/difficulty pools hold only one or two
 * topics, so cycling that pool produced an 18-slot sequence where every entry
 * was the same topic — the wheel turned and the ticks played, but the question
 * text never changed and looked out of sync.
 *
 * `finalTopic` is excluded from the decoy pool, so the topic shown immediately
 * before the wheel lands is always different from the one it lands on.
 * Cycling a shuffled array by modulo also guarantees no two adjacent entries
 * repeat while the pool has more than one topic.
 *
 * The landing topic is still chosen by `pickTopic(categoryId, difficulty)`,
 * so the question the user actually answers always matches their selection.
 */
export function buildSpinSequence(finalTopic: Topic, length = 18): Topic[] {
  const slots = Math.max(length, 2);

  const pool = getTopics().filter((topic) => topic.id !== finalTopic.id);
  const candidates = pool.length > 0 ? pool : [finalTopic];

  const ordered = shuffle(candidates);
  const sequence: Topic[] = [];

  for (let i = 0; i < slots - 1; i += 1) {
    sequence.push(ordered[i % ordered.length]);
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
