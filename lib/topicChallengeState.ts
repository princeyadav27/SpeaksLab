export const TOPIC_CHALLENGE_STORAGE_KEY = "speaklab.topicChallenge";

export type TopicChallengeStep = "category" | "spin";
export type TopicDifficulty = "easy" | "medium" | "hard";
export type TopicMode = "random";

export type TopicChallengeSnapshot = {
  categoryId: string | null;
  difficulty: TopicDifficulty;
  mode: TopicMode;
  topicId: string | null;
  step: TopicChallengeStep;
};

export const emptyTopicChallengeSnapshot: TopicChallengeSnapshot = {
  categoryId: null,
  difficulty: "hard",
  mode: "random",
  topicId: null,
  step: "category",
};

let lastSnapshot: TopicChallengeSnapshot | null = null;
let lastSnapshotRaw: string | null = null;

const listeners = new Set<() => void>();

export function subscribeTopicChallenge(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emitTopicChallenge() {
  listeners.forEach((listener) => listener());
}

export function readTopicChallengeState(): TopicChallengeSnapshot {
  if (typeof window === "undefined") return emptyTopicChallengeSnapshot;

  try {
    const raw = sessionStorage.getItem(TOPIC_CHALLENGE_STORAGE_KEY);
    if (!raw) {
      if (lastSnapshotRaw === null && lastSnapshot) {
        return lastSnapshot;
      }
      lastSnapshotRaw = null;
      lastSnapshot = emptyTopicChallengeSnapshot;
      return lastSnapshot;
    }

    if (lastSnapshotRaw === raw && lastSnapshot) {
      return lastSnapshot;
    }

    const parsed = JSON.parse(raw) as Partial<TopicChallengeSnapshot>;
    const difficulty =
      parsed.difficulty === "easy" ||
      parsed.difficulty === "medium" ||
      parsed.difficulty === "hard"
        ? parsed.difficulty
        : "hard";

    lastSnapshot = {
      categoryId:
        typeof parsed.categoryId === "string" ? parsed.categoryId : null,
      difficulty,
      mode: "random",
      topicId: typeof parsed.topicId === "string" ? parsed.topicId : null,
      step: parsed.step === "spin" ? "spin" : "category",
    };
    lastSnapshotRaw = raw;
    return lastSnapshot;
  } catch {
    if (lastSnapshotRaw === null && lastSnapshot) {
      return lastSnapshot;
    }
    lastSnapshotRaw = null;
    lastSnapshot = emptyTopicChallengeSnapshot;
    return lastSnapshot;
  }
}

export function writeTopicChallengeState(
  snapshot: TopicChallengeSnapshot,
): void {
  if (typeof window === "undefined") return;
  const serialized = JSON.stringify(snapshot);
  sessionStorage.setItem(TOPIC_CHALLENGE_STORAGE_KEY, serialized);
  lastSnapshot = snapshot;
  lastSnapshotRaw = serialized;
  emitTopicChallenge();
}
