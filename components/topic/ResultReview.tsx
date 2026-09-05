"use client";

import { useState } from "react";
import type { SavedRecording } from "@/lib/recordingsDb";
import type { EvaluationScores } from "@/lib/aiEvaluation";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(totalSeconds: number) {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, score));
  const color =
    pct >= 75 ? "bg-emerald-500" : pct >= 55 ? "bg-cobalt" : "bg-[#c45c5c]";
  return (
    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  recording: SavedRecording;
  blobUrl: string | null;
  onTryAgain: () => void;
  onNewChallenge: () => void;
  onRetryEvaluation?: () => void;
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function ResultReview({
  recording,
  blobUrl,
  onTryAgain,
  onNewChallenge,
  onRetryEvaluation,
}: Props) {
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const ev = recording.evaluation ?? null;
  const mx = recording.metrics ?? null;

  const scoreColor =
    ev && ev.overallScore >= 75
      ? "text-emerald-600"
      : ev && ev.overallScore >= 55
        ? "text-cobalt"
        : "text-[#c45c5c]";

  const SCORE_LABELS: [keyof EvaluationScores, string][] = ev
    ? [
        ["fluency", "Fluency"],
        ["grammar", "Grammar"],
        ["vocabulary", "Vocabulary"],
        ["clarity", "Clarity"],
        ["structure", "Structure"],
        ["technicalUnderstanding", "Technical"],
        ["reasoning", "Reasoning"],
        ["communication", "Communication"],
      ]
    : [];

  return (
    <div className="mx-auto w-full max-w-[680px] space-y-4 pb-16">

      {/* ── Back link ─────────────────────────────────────────────────────── */}
      <p className="text-[11px] tracking-[0.18em] text-cobalt">
        ‹ YOUR RESULT
      </p>

      {/* ── Topic ─────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-ink/10 bg-[#fbf7ef] px-5 py-4">
        <p className="text-[11px] uppercase tracking-[0.18em] text-ink/40">
          {recording.categoryName} · {recording.difficulty}
        </p>
        <h2 className="mt-1.5 font-display text-[1.5rem] leading-snug text-ink">
          {recording.topicName}
        </h2>
        <p className="mt-0.5 text-[12px] text-ink/45">
          {new Date(recording.createdAt).toLocaleString()}
        </p>
      </div>

      {/* ── Overall score ─────────────────────────────────────────────────── */}
      {ev ? (
        <div className="rounded-2xl border border-ink/10 bg-[#fbf7ef] px-5 py-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-ink/40">Overall Score</p>
          <p className={`mt-1 font-display text-[3.5rem] leading-none ${scoreColor}`}>
            {ev.overallScore}
            <span className="font-sans text-[1.1rem] text-ink/30"> / 100</span>
          </p>
        </div>
      ) : null}

      {/* ── Score breakdown ───────────────────────────────────────────────── */}
      {ev ? (
        <div className="rounded-2xl border border-ink/10 bg-[#fbf7ef] px-5 py-4">
          <p className="mb-3 text-[11px] uppercase tracking-[0.18em] text-ink/40">
            Score Breakdown
          </p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            {SCORE_LABELS.map(([key, label]) => (
              <div key={key}>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[13px] text-ink/70">{label}</p>
                  <p className="font-display text-[1.1rem] text-ink">{ev.scores[key]}</p>
                </div>
                <ScoreBar score={ev.scores[key]} />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Speaking metrics ──────────────────────────────────────────────── */}
      {mx ? (
        <div className="rounded-2xl border border-ink/10 bg-[#fbf7ef] px-5 py-4">
          <p className="mb-3 text-[11px] uppercase tracking-[0.18em] text-ink/40">
            Speaking Metrics
          </p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.12em] text-ink/40">Duration</p>
              <p className="mt-0.5 font-display text-[1.2rem] text-ink">{fmt(mx.durationSeconds)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.12em] text-ink/40">Words</p>
              <p className="mt-0.5 font-display text-[1.2rem] text-ink">{mx.wordCount}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.12em] text-ink/40">WPM</p>
              <p className="mt-0.5 font-display text-[1.2rem] text-ink">
                {mx.wordsPerMinute ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.12em] text-ink/40">Sentences</p>
              <p className="mt-0.5 font-display text-[1.2rem] text-ink">{mx.sentenceCount}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.12em] text-ink/40">Filler Words</p>
              <p className="mt-0.5 font-display text-[1.2rem] text-ink">{mx.fillerWordCount}</p>
            </div>
          </div>

          {mx.fillerWords.length > 0 ? (
            <div className="mt-3 border-t border-ink/10 pt-3">
              <p className="mb-1.5 text-[11px] uppercase tracking-[0.12em] text-ink/40">
                Filler breakdown
              </p>
              <div className="flex flex-wrap gap-1.5">
                {mx.fillerWords.slice(0, 6).map((f) => (
                  <span
                    key={f.word}
                    className="rounded-full bg-[#efe8da] px-2.5 py-1 text-[12px] text-ink/70"
                  >
                    {f.word} ×{f.count}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {mx.repeatedWords.length > 0 ? (
            <div className="mt-3 border-t border-ink/10 pt-3">
              <p className="mb-1.5 text-[11px] uppercase tracking-[0.12em] text-ink/40">
                Repeated words
              </p>
              <div className="flex flex-wrap gap-1.5">
                {mx.repeatedWords.map((r) => (
                  <span
                    key={r.word}
                    className="rounded-full bg-[#efe8da] px-2.5 py-1 text-[12px] text-ink/70"
                  >
                    {r.word} ×{r.count}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── AI Feedback ───────────────────────────────────────────────────── */}
      {ev ? (
        <div className="rounded-2xl border border-ink/10 bg-[#fbf7ef] px-5 py-4">
          <p className="mb-4 text-[11px] uppercase tracking-[0.18em] text-ink/40">AI Feedback</p>

          {/* Strengths */}
          {ev.strengths.length > 0 ? (
            <div className="mb-4">
              <p className="mb-2 text-[12px] font-medium uppercase tracking-[0.14em] text-emerald-700">
                Your strengths
              </p>
              <ul className="space-y-1.5">
                {ev.strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-[14px] text-ink/80">
                    <span className="mt-0.5 shrink-0 text-emerald-600">✓</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Weaknesses */}
          {ev.weaknesses.length > 0 ? (
            <div className="mb-4 border-t border-ink/10 pt-4">
              <p className="mb-2 text-[12px] font-medium uppercase tracking-[0.14em] text-[#c45c5c]">
                Areas to improve
              </p>
              <ul className="space-y-1.5">
                {ev.weaknesses.map((w, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-[14px] text-ink/80">
                    <span className="mt-0.5 shrink-0 text-[#c45c5c]">→</span>
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Grammar corrections */}
          {ev.grammarCorrections.length > 0 ? (
            <div className="mb-4 border-t border-ink/10 pt-4">
              <p className="mb-2 text-[12px] font-medium uppercase tracking-[0.14em] text-ink/50">
                Corrections
              </p>
              <ul className="space-y-1.5">
                {ev.grammarCorrections.map((g, i) => (
                  <li
                    key={i}
                    className="rounded-xl bg-[#f5efe5] px-3 py-2 text-[13px] leading-relaxed text-ink/80"
                  >
                    {g}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Vocabulary improvements */}
          {ev.vocabularyImprovements.length > 0 ? (
            <div className="mb-4 border-t border-ink/10 pt-4">
              <p className="mb-2 text-[12px] font-medium uppercase tracking-[0.14em] text-ink/50">
                Vocabulary
              </p>
              <ul className="space-y-1.5">
                {ev.vocabularyImprovements.map((v, i) => (
                  <li
                    key={i}
                    className="rounded-xl bg-[#f5efe5] px-3 py-2 text-[13px] leading-relaxed text-ink/80"
                  >
                    {v}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Technical feedback */}
          {ev.technicalFeedback.length > 0 ? (
            <div className="border-t border-ink/10 pt-4">
              <p className="mb-2 text-[12px] font-medium uppercase tracking-[0.14em] text-cobalt/70">
                Technical feedback
              </p>
              <ul className="space-y-1.5">
                {ev.technicalFeedback.map((t, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-[14px] text-ink/80">
                    <span className="mt-0.5 shrink-0 text-cobalt">·</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── No evaluation fallback ────────────────────────────────────────── */}
      {!ev ? (
        <div className="rounded-2xl border border-[#d77f7f]/30 bg-[#f8e6e6] px-5 py-4">
          <p className="text-[13px] font-medium text-[#8b3c3c]">AI evaluation not available</p>
          <p className="mt-1 text-[13px] text-[#8b3c3c]/80">
            Your recording, transcript, and speaking metrics are saved. You can
            retry the AI evaluation below.
          </p>
          {onRetryEvaluation ? (
            <button
              type="button"
              onClick={onRetryEvaluation}
              className="mt-3 rounded-md border border-[#d77f7f]/40 bg-[#fbf7ef] px-4 py-2 text-[13px] font-medium text-[#8b3c3c] hover:bg-[#f5efe5]"
            >
              Retry AI Evaluation
            </button>
          ) : null}
        </div>
      ) : null}

      {/* ── Next focus ────────────────────────────────────────────────────── */}
      {ev?.nextRecommendation ? (
        <div className="rounded-2xl border border-cobalt/20 bg-[#eef1fa] px-5 py-4">
          <p className="mb-1.5 text-[11px] uppercase tracking-[0.18em] text-cobalt/60">
            Next Focus
          </p>
          <p className="text-[15px] leading-relaxed text-ink">
            {ev.nextRecommendation}
          </p>
        </div>
      ) : null}

      {/* ── Recording replay ──────────────────────────────────────────────── */}
      {blobUrl ? (
        <div className="rounded-2xl border border-ink/10 bg-[#fbf7ef] px-5 py-4">
          <p className="mb-3 text-[11px] uppercase tracking-[0.18em] text-ink/40">
            Your Recording
          </p>
          {recording.blob.type.includes("video") ? (
            <video
              src={blobUrl}
              controls
              playsInline
              className="w-full rounded-xl object-cover"
              style={{ maxHeight: "260px" }}
            />
          ) : (
            <audio src={blobUrl} controls className="w-full" />
          )}
        </div>
      ) : null}

      {/* ── Transcript (collapsible) ──────────────────────────────────────── */}
      {recording.transcript ? (
        <div className="rounded-2xl border border-ink/10 bg-[#fbf7ef] px-5 py-4">
          <button
            type="button"
            onClick={() => setTranscriptOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-3 text-left"
          >
            <p className="text-[11px] uppercase tracking-[0.18em] text-ink/40">
              Transcript
            </p>
            <span className="text-[12px] text-cobalt">
              {transcriptOpen ? "Hide ▲" : "View ▼"}
            </span>
          </button>
          {transcriptOpen ? (
            <p className="mt-3 text-[14px] leading-relaxed text-ink/75">
              {recording.transcript}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* ── Actions ───────────────────────────────────────────────────────── */}
      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onTryAgain}
          className="flex-1 rounded-md border border-ink/15 bg-[#f4ecdf] py-3 text-[15px] font-medium text-ink hover:border-cobalt/40 hover:text-cobalt"
        >
          ↻ Try Again
        </button>
        <button
          type="button"
          onClick={onNewChallenge}
          className="flex-1 rounded-md bg-cobalt py-3 text-[15px] font-medium text-ivory hover:bg-cobalt-deep"
        >
          New Challenge →
        </button>
      </div>
    </div>
  );
}
