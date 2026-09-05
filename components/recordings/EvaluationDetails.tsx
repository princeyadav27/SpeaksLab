"use client";

import type { AIEvaluation, EvaluationScores } from "@/lib/aiEvaluation";

const SCORE_LABELS: [keyof EvaluationScores, string][] = [
  ["fluency", "Fluency"],
  ["grammar", "Grammar"],
  ["vocabulary", "Vocabulary"],
  ["clarity", "Clarity"],
  ["structure", "Structure"],
  ["technicalUnderstanding", "Technical Understanding"],
  ["reasoning", "Reasoning"],
  ["communication", "Communication"],
];

function scoreBarColor(score: number) {
  if (score >= 75) return "bg-emerald-500";
  if (score >= 55) return "bg-cobalt";
  return "bg-[#c45c5c]";
}

function FeedbackSection({
  title,
  items,
  tone = "neutral",
}: {
  title: string;
  items: string[];
  tone?: "positive" | "warning" | "accent" | "neutral";
}) {
  const titleClass = {
    positive: "text-emerald-700",
    warning: "text-[#b54f4f]",
    accent: "text-cobalt",
    neutral: "text-ink/60",
  }[tone];

  return (
    <section className="rounded-xl border border-ink/10 bg-[#f7f1e7] p-4">
      <h4 className={`text-[11px] font-medium uppercase tracking-[0.16em] ${titleClass}`}>
        {title}
      </h4>
      {items.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {items.map((item, index) => (
            <li key={`${title}-${index}`} className="flex items-start gap-2.5 text-[13px] leading-relaxed text-ink/75">
              <span className={`mt-0.5 shrink-0 ${titleClass}`}>{tone === "positive" ? "✓" : tone === "warning" ? "!" : "·"}</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[13px] leading-relaxed text-ink/50">
          There is not enough transcript evidence for specific feedback in this section.
        </p>
      )}
    </section>
  );
}

export default function EvaluationDetails({ evaluation }: { evaluation: AIEvaluation }) {
  return (
    <section className="mt-6 rounded-2xl border border-cobalt/15 bg-[#fbf7ef] p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-ink/10 pb-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-cobalt">AI Evaluation</p>
          <h3 className="mt-1 font-display text-[1.5rem] text-ink">Your complete speaking review</h3>
        </div>
        <p className="font-display text-[2.2rem] leading-none text-cobalt">
          {evaluation.overallScore}<span className="font-sans text-[12px] text-ink/45"> / 100</span>
        </p>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
        {SCORE_LABELS.map(([key, label]) => {
          const score = evaluation.scores[key];
          return (
            <div key={key}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[13px] text-ink/70">{label}</p>
                <p className="font-display text-[1.15rem] text-ink">{score}<span className="font-sans text-[10px] text-ink/40"> / 100</span></p>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink/10">
                <div className={`h-full rounded-full ${scoreBarColor(score)}`} style={{ width: `${score}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <section className="mt-6 rounded-xl border border-cobalt/20 bg-[#eef1fa] p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="text-[11px] font-medium uppercase tracking-[0.16em] text-cobalt">Question Relevance</h4>
          <p className="font-display text-[1.2rem] text-cobalt">{evaluation.questionRelevance.score}<span className="font-sans text-[10px] text-ink/45"> / 100</span></p>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/10"><div className="h-full rounded-full bg-cobalt" style={{ width: `${evaluation.questionRelevance.score}%` }} /></div>
        <p className="mt-3 text-[13px] leading-relaxed text-ink/75">{evaluation.questionRelevance.explanation}</p>
        <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.12em] text-ink/45">{evaluation.questionRelevance.addressed ? "Question addressed" : "Question not fully addressed"}</p>
      </section>

      <div className="mt-6 grid gap-3 lg:grid-cols-2">
        <FeedbackSection title="Strengths" items={evaluation.strengths} tone="positive" />
        <FeedbackSection title="Weaknesses" items={evaluation.weaknesses} tone="warning" />
        <FeedbackSection title="Grammar Corrections" items={evaluation.grammarCorrections} />
        <FeedbackSection title="Vocabulary Improvements" items={evaluation.vocabularyImprovements} />
        <FeedbackSection title="Technical Feedback" items={evaluation.technicalFeedback} tone="accent" />
        <section className="rounded-xl border border-cobalt/20 bg-[#eef1fa] p-4">
          <h4 className="text-[11px] font-medium uppercase tracking-[0.16em] text-cobalt">Next Focus</h4>
          <p className="mt-3 text-[13px] leading-relaxed text-ink/80">{evaluation.nextRecommendation || "There is not enough transcript evidence for a specific next focus."}</p>
        </section>
      </div>
    </section>
  );
}
