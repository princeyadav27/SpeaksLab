// Objective, text-based speaking metrics.
// All calculations are deterministic and require no external services.
// Duration comes from the recording timer — not audio analysis.

export type FillerWordEntry = {
  word: string;
  count: number;
};

export type RepeatedWordEntry = {
  word: string;
  count: number;
};

export type SpeakingMetrics = {
  /** Recording duration in whole seconds (from the recording timer). */
  durationSeconds: number;
  /** Total spoken words in the transcript. */
  wordCount: number;
  /** Words per minute, rounded. Null when duration is zero. */
  wordsPerMinute: number | null;
  /** Number of sentences detected in the transcript. */
  sentenceCount: number;
  /** Total filler-word occurrences across all filler words. */
  fillerWordCount: number;
  /** Per-filler breakdown, sorted by count descending. Only includes words that appeared at least once. */
  fillerWords: FillerWordEntry[];
  /** Content words spoken 3+ times, sorted by count descending (top 8). */
  repeatedWords: RepeatedWordEntry[];
};

// ─── Filler word list ────────────────────────────────────────────────────────
// Each entry is matched as a whole word/phrase (case-insensitive).
// Phrases must come before their sub-words so they are matched first.
const FILLER_WORDS: string[] = [
  "you know what i mean",
  "you know what i'm saying",
  "if you will",
  "kind of like",
  "sort of like",
  "you know",
  "i mean",
  "i guess",
  "i suppose",
  "i think",
  "like i said",
  "basically",
  "actually",
  "literally",
  "obviously",
  "honestly",
  "totally",
  "definitely",
  "essentially",
  "arguably",
  "seemingly",
  "apparently",
  "right",
  "okay",
  "so",
  "um",
  "uh",
  "er",
  "ah",
  "hmm",
  "like",
  "well",
  "anyway",
  "anyways",
  "whatever",
  "stuff",
  "thing",
  "things",
  "kind of",
  "sort of",
  "kind",
  "sort",
];

// ─── Stop-words (excluded from repeated-word analysis) ───────────────────────
const STOP_WORDS = new Set([
  "the","a","an","and","or","but","in","on","at","to","for","of","with",
  "is","are","was","were","be","been","being","have","has","had","do","does",
  "did","will","would","could","should","may","might","shall","can","need",
  "that","this","these","those","it","its","he","she","they","we","you","i",
  "me","him","her","them","us","my","your","his","our","their","its",
  "what","which","who","whom","when","where","why","how","not","no","nor",
  "if","then","than","as","so","by","from","into","through","during",
  "before","after","above","below","up","down","out","off","over","under",
  "again","further","once","here","there","all","each","few","more","most",
  "other","some","such","only","own","same","very","just","about","also",
]);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Strip leading/trailing punctuation from a token, lowercase it. */
function normalise(token: string): string {
  return token.replace(/^[^a-z0-9']+|[^a-z0-9']+$/gi, "").toLowerCase();
}

/** Count whole-word (or whole-phrase) occurrences of `needle` in `text`. */
function countWholeWord(text: string, needle: string): number {
  // Build a regex: word-boundary before the first word, after the last word.
  // For multi-word phrases the spaces are treated literally.
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`\\b${escaped}\\b`, "gi");
  return (text.match(pattern) ?? []).length;
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Calculate objective speaking metrics from a Whisper transcript and the
 * recording duration measured by the in-app timer.
 *
 * Pass `durationSeconds = 0` only when the duration is genuinely unknown —
 * wordsPerMinute will be returned as `null` in that case.
 */
export function calculateMetrics(
  transcript: string,
  durationSeconds: number,
): SpeakingMetrics {
  const trimmed = transcript.trim();

  // ── Word count ──────────────────────────────────────────────────────────
  const rawTokens = trimmed.length > 0 ? trimmed.split(/\s+/) : [];
  const words = rawTokens.map(normalise).filter((w) => w.length > 0);
  const wordCount = words.length;

  // ── WPM ────────────────────────────────────────────────────────────────
  const wordsPerMinute =
    durationSeconds > 0
      ? Math.round((wordCount / durationSeconds) * 60)
      : null;

  // ── Sentence count ─────────────────────────────────────────────────────
  // Split on sentence-ending punctuation; count non-empty fragments.
  const sentenceFragments = trimmed
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const sentenceCount = sentenceFragments.length;

  // ── Filler words ────────────────────────────────────────────────────────
  // Work on a single lowercase version of the full transcript.
  const lower = trimmed.toLowerCase();

  const fillerEntries: FillerWordEntry[] = [];
  let fillerWordCount = 0;

  for (const filler of FILLER_WORDS) {
    const count = countWholeWord(lower, filler);
    if (count > 0) {
      fillerEntries.push({ word: filler, count });
      fillerWordCount += count;
    }
  }

  // Sort by count desc, then alphabetically for ties.
  fillerEntries.sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));

  // ── Repeated words ──────────────────────────────────────────────────────
  // Count content words (≥4 chars, not a stop-word) that appear 3+ times.
  const freq = new Map<string, number>();
  for (const w of words) {
    // Strip possessive apostrophe suffixes
    const clean = w.replace(/'s$/, "");
    if (clean.length < 4) continue;
    if (STOP_WORDS.has(clean)) continue;
    freq.set(clean, (freq.get(clean) ?? 0) + 1);
  }

  const repeatedWords: RepeatedWordEntry[] = [];
  for (const [word, count] of freq) {
    if (count >= 3) repeatedWords.push({ word, count });
  }
  repeatedWords.sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));

  return {
    durationSeconds: Math.round(durationSeconds),
    wordCount,
    wordsPerMinute,
    sentenceCount,
    fillerWordCount,
    fillerWords: fillerEntries,
    repeatedWords: repeatedWords.slice(0, 8),
  };
}
