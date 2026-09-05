"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import Navbar from "@/components/Navbar";
import RecordingPlayback from "@/components/recordings/RecordingPlayback";
import EvaluationDetails from "@/components/recordings/EvaluationDetails";
import { deleteRecording, getRecordings, saveRecording, type SavedRecording } from "@/lib/recordingsDb";
import { getCategories } from "@/lib/categories";
import { getTopicById } from "@/lib/topics";
import { calculateMetrics } from "@/lib/speakingMetrics";
import { isCompleteEvaluation, type AIEvaluation } from "@/lib/aiEvaluation";

const PAGE_SIZE = 5;

function fmtDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  return `${String(Math.floor(safeSeconds / 60)).padStart(2, "0")}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

export default function MyRecordingsPage() {
  const [recordings, setRecordings] = useState<SavedRecording[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [transcribingId, setTranscribingId] = useState<string | null>(null);
  const [evaluatingId, setEvaluatingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const categoryMenuRef = useRef<HTMLDivElement>(null);
  const categories = useMemo(() => getCategories(), []);

  useEffect(() => {
    void getRecordings().then((items) => {
      setRecordings(items);
      setSelectedId(items[0]?.id ?? null);
    }).catch(() => setRecordings([]));
  }, []);

  useEffect(() => {
    function closeCategoryMenu(event: MouseEvent) {
      if (!categoryMenuRef.current?.contains(event.target as Node)) {
        setCategoryMenuOpen(false);
      }
    }

    function closeCategoryMenuOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setCategoryMenuOpen(false);
    }

    document.addEventListener("mousedown", closeCategoryMenu);
    document.addEventListener("keydown", closeCategoryMenuOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeCategoryMenu);
      document.removeEventListener("keydown", closeCategoryMenuOnEscape);
    };
  }, []);

  const filteredRecordings = useMemo(() => {
    if (!recordings) return [];
    const query = search.trim().toLowerCase();
    return recordings.filter((recording) => {
      const matchesSearch = !query || [recording.topicName, recording.categoryName, recording.transcript ?? ""].some((value) => value.toLowerCase().includes(query));
      return matchesSearch && (categoryFilter === "all" || recording.categoryId === categoryFilter);
    });
  }, [categoryFilter, recordings, search]);
  const totalPages = Math.max(1, Math.ceil(filteredRecordings.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleRecordings = filteredRecordings.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const selected = recordings?.find((recording) => recording.id === selectedId) ?? visibleRecordings[0] ?? null;
  const selectedCategoryName = categories.find((category) => category.id === categoryFilter)?.name ?? "All Categories";

  function updateRecord(updated: SavedRecording) {
    setRecordings((current) => current?.map((item) => item.id === updated.id ? updated : item) ?? current);
  }

  async function handleTranscribe(recording: SavedRecording) {
    setTranscribingId(recording.id);
    setActionError(null);
    try {
      const extension = recording.blob.type.includes("ogg") ? "ogg" : recording.blob.type.includes("mp4") ? "mp4" : "webm";
      const formData = new FormData();
      formData.append("file", recording.blob, `recording.${extension}`);
      const response = await fetch("/api/transcribe", { method: "POST", body: formData });
      const data = (await response.json()) as { transcript?: string; error?: string };
      if (!response.ok || !data.transcript?.trim()) throw new Error(data.error ?? "Transcription failed.");
      const transcript = data.transcript.trim();
      const updated = { ...recording, transcript, metrics: recording.metrics ?? calculateMetrics(transcript, recording.durationSeconds) };
      await saveRecording(updated);
      updateRecord(updated);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Transcription failed.");
    } finally {
      setTranscribingId(null);
    }
  }

  async function handleEvaluate(recording: SavedRecording) {
    if (!recording.transcript) {
      setActionError("Transcribe this recording before requesting an evaluation.");
      return;
    }
    if (isCompleteEvaluation(recording.evaluation)) {
      setActionError(null);
      return;
    }
    setEvaluatingId(recording.id);
    setActionError(null);
    try {
      const topic = getTopicById(recording.topicId);
      const metrics = recording.metrics ?? calculateMetrics(recording.transcript, recording.durationSeconds);
      const response = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: recording.categoryName, challengeQuestion: recording.challengeQuestion ?? recording.topicName, topicTitle: recording.topicName, topicPrompt: topic?.prompt ?? "Explain your answer clearly and confidently.", topicType: topic?.type ?? "opinion", difficulty: recording.difficulty, transcript: recording.transcript, metrics }),
      });
      const data = (await response.json()) as { evaluation?: AIEvaluation; error?: string };
      if (!response.ok || !data.evaluation) throw new Error(data.error ?? "AI evaluation failed.");
      const updated = { ...recording, metrics, evaluation: data.evaluation };
      await saveRecording(updated);
      updateRecord(updated);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "AI evaluation failed.");
    } finally {
      setEvaluatingId(null);
    }
  }

  async function handleDelete(recording: SavedRecording) {
    try {
      await deleteRecording(recording.id);
      const remaining = recordings?.filter((item) => item.id !== recording.id) ?? [];
      setRecordings(remaining);
      setSelectedId(remaining[0]?.id ?? null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to delete recording.");
    }
  }

  async function handleShare(recording: SavedRecording) {
    try {
      await navigator.clipboard.writeText(`${recording.topicName} - SpeakLab recording`);
      setShareMessage("Recording details copied.");
    } catch {
      setShareMessage("Copy is unavailable in this browser.");
    }
  }

  return (
    <main className="paper-surface min-h-svh bg-ivory text-ink">
      <div className="relative z-10 flex min-h-svh flex-col">
        <Navbar variant="solid" />
        <section className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col px-5 pb-10 pt-7 sm:px-8 lg:px-10">
          <div className="flex flex-col gap-5 border-b border-ink/10 pb-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[10px] font-medium tracking-[0.24em] text-cobalt">MY RECORDINGS</p>
              <h1 className="mt-2 font-display text-[clamp(2rem,4vw,3rem)] leading-none text-ink">Your saved recordings.</h1>
              <p className="mt-3 max-w-[38rem] text-[13px] leading-relaxed text-ink/55">Review your practice, transcripts, and AI feedback saved locally on this device.</p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
              <label className="flex min-w-0 items-center gap-2 rounded-xl border border-ink/10 bg-[#fbf7ef] px-3 py-2 text-[12px] text-ink/45 sm:w-48"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search recordings..." className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink/40" /></label>
              <div ref={categoryMenuRef} className="relative w-full sm:w-48">
                <button
                  type="button"
                  onClick={() => setCategoryMenuOpen((open) => !open)}
                  aria-expanded={categoryMenuOpen}
                  aria-haspopup="listbox"
                  className="flex w-full items-center gap-2 rounded-xl border border-ink/10 bg-[#fbf7ef] px-3 py-2 text-left text-[12px] text-ink/70"
                >
                  <span className="min-w-0 flex-1 truncate">{selectedCategoryName}</span>
                  <span className={`h-2 w-2 rotate-45 border-b border-r border-current transition-transform ${categoryMenuOpen ? "-translate-y-0.5 rotate-[225deg]" : "-translate-y-0.5"}`} aria-hidden="true" />
                </button>
                {categoryMenuOpen ? (
                  <ul role="listbox" aria-label="Filter by category" className="scrollbar-subtle absolute left-0 right-0 top-full z-30 mt-2 max-h-60 overflow-y-auto overscroll-contain rounded-xl border border-ink/10 bg-[#fbf7ef] p-1.5 shadow-[0_14px_35px_rgba(22,22,22,0.12)]">
                    {[{ id: "all", name: "All Categories" }, ...categories].map((category) => (
                      <li key={category.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={categoryFilter === category.id}
                          onClick={() => { setCategoryFilter(category.id); setPage(1); setCategoryMenuOpen(false); }}
                          className={`w-full rounded-lg px-2.5 py-2 text-left text-[12px] ${categoryFilter === category.id ? "bg-cobalt text-ivory" : "text-ink/75 hover:bg-ink/5"}`}
                        >
                          {category.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          </div>

          {actionError ? <p className="mt-4 rounded-xl border border-[#d77f7f]/30 bg-[#f8e6e6] px-4 py-3 text-[13px] text-[#8b3c3c]">{actionError}</p> : null}
          {recordings === null ? <p className="py-12 text-[14px] text-ink/55">Loading recordings&hellip;</p> : recordings.length === 0 ? <div className="mt-8 rounded-2xl border border-ink/10 bg-[#fbf7ef] p-7"><p className="text-[14px] text-ink/55">No recordings yet. Complete a Topic Challenge to create your first one.</p><Link href="/practice/topic" className="mt-4 inline-flex rounded-md bg-cobalt px-4 py-2 text-[13px] font-medium text-ivory hover:bg-cobalt-deep">Start a challenge &rarr;</Link></div> : filteredRecordings.length === 0 ? <p className="py-12 text-[14px] text-ink/55">No recordings match this search.</p> : selected ? (
            <div className="mt-6 grid min-h-0 flex-1 gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
              <aside className="min-w-0"><div className="space-y-2">{visibleRecordings.map((recording) => <button key={recording.id} type="button" onClick={() => setSelectedId(recording.id)} className={`flex w-full gap-3 rounded-xl border p-2 text-left transition-colors ${recording.id === selected.id ? "border-cobalt bg-[#eef1fa]" : "border-transparent bg-[#fbf7ef] hover:border-ink/15"}`}><span className="relative flex h-[76px] w-[88px] shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-[#cfd3d8] to-[#9da4ac] text-ivory"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink/70 text-[12px]">▶</span><span className="absolute bottom-1 right-1 rounded bg-ink/75 px-1.5 py-0.5 font-mono text-[9px]">{fmtDuration(recording.durationSeconds)}</span></span><span className="min-w-0 flex-1 py-0.5"><span className="block truncate font-display text-[14px] text-ink">{recording.topicName}</span><span className="mt-1 flex flex-wrap gap-1 text-[9px] uppercase tracking-[0.08em]"><span className="rounded-full bg-[#dfe7ff] px-1.5 py-0.5 text-cobalt">{recording.categoryName}</span><span className="rounded-full bg-[#f8e0e0] px-1.5 py-0.5 text-[#9d4848]">{recording.difficulty}</span></span><span className="mt-1 block text-[10px] text-ink/45">{new Date(recording.createdAt).toLocaleDateString()}</span></span></button>)}</div><div className="mt-5 flex items-center justify-between text-[11px] text-ink/50"><span>{(currentPage - 1) * PAGE_SIZE + 1}&ndash;{Math.min(currentPage * PAGE_SIZE, filteredRecordings.length)} of {filteredRecordings.length}</span><div className="flex items-center gap-1"><button type="button" disabled={currentPage === 1} onClick={() => setPage((value) => value - 1)} className="h-7 w-7 rounded-lg border border-ink/10 disabled:opacity-30">‹</button>{Array.from({ length: totalPages }, (_, index) => index + 1).map((number) => <button key={number} type="button" onClick={() => setPage(number)} className={`h-7 w-7 rounded-lg text-[11px] ${number === currentPage ? "bg-cobalt text-ivory" : "hover:bg-ink/5"}`}>{number}</button>)}<button type="button" disabled={currentPage === totalPages} onClick={() => setPage((value) => value + 1)} className="h-7 w-7 rounded-lg border border-ink/10 disabled:opacity-30">›</button></div></div></aside>

              <article className="min-w-0 rounded-2xl border border-ink/10 bg-[#fbf7ef] p-5 sm:p-7"><div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><h2 className="font-display text-[clamp(1.35rem,3vw,2rem)] leading-tight text-ink">{selected.topicName}</h2><div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-ink/55"><span className="rounded-full bg-[#eae5da] px-2 py-1 text-ink/75">{selected.categoryName}</span><span className="rounded-full bg-[#f8e0e0] px-2 py-1 text-[#9d4848]">{selected.difficulty}</span><span>{new Date(selected.createdAt).toLocaleString()}</span><span>◷ {fmtDuration(selected.durationSeconds)}</span></div></div><div className="flex items-center gap-2"><button type="button" onClick={() => void handleDelete(selected)} className="rounded-lg border border-[#d77f7f]/50 px-3 py-2 text-[12px] text-[#a44848] hover:bg-[#f8e6e6]">Delete</button><button type="button" onClick={() => void handleShare(selected)} className="rounded-lg border border-ink/10 px-3 py-2 text-[12px] text-ink/70 hover:border-cobalt/30 hover:text-cobalt">Share</button></div></div>

                <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(230px,.65fr)]"><div><RecordingPlayback recording={selected} className="aspect-video w-full rounded-xl bg-ink object-cover" showControls /><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => void handleTranscribe(selected)} disabled={transcribingId === selected.id || evaluatingId === selected.id} className="rounded-lg bg-cobalt px-3.5 py-2 text-[12px] font-medium text-ivory disabled:opacity-50">{transcribingId === selected.id ? "Transcribing..." : selected.transcript ? "Transcribe Again" : "Transcribe"}</button><button type="button" onClick={() => void handleEvaluate(selected)} disabled={!selected.transcript || transcribingId === selected.id || evaluatingId === selected.id} title={!selected.transcript ? "Transcribe this recording first" : undefined} className="rounded-lg border border-cobalt/25 bg-[#eef1fa] px-3.5 py-2 text-[12px] font-medium text-cobalt disabled:cursor-not-allowed disabled:opacity-45">{evaluatingId === selected.id ? "Evaluating..." : "AI Evaluation"}</button>{shareMessage ? <span className="self-center text-[11px] text-emerald-700">{shareMessage}</span> : null}</div></div><section className="rounded-xl border border-ink/10 bg-[#f7f1e7] p-4"><div className="flex items-center justify-between gap-3"><h3 className="font-display text-[1.15rem] text-ink">Transcript</h3>{selected.transcript ? <button type="button" onClick={() => void navigator.clipboard?.writeText(selected.transcript ?? "")} className="rounded-lg border border-ink/10 bg-[#fbf7ef] px-2.5 py-1.5 text-[11px] text-ink/70">Copy</button> : null}</div><p className="mt-3 max-h-48 overflow-y-auto text-[13px] leading-relaxed text-ink/70">{selected.transcript ?? "No transcript yet. Use Transcribe to generate one from this recording."}</p></section></div>

                {selected.metrics ? <div className="mt-5 flex flex-wrap gap-4 border-t border-ink/10 pt-4 text-[11px] text-ink/55"><span>{selected.metrics.wordCount} words</span><span>{selected.metrics.sentenceCount} sentences</span><span>{selected.metrics.wordsPerMinute ?? "--"} WPM</span><span>{selected.metrics.fillerWordCount} filler words</span></div> : null}
                <section className="mt-6 rounded-xl border border-ink/10 bg-[#f7f1e7] p-4">
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-cobalt">Original Challenge Question</p>
                  <p className="mt-2 font-display text-[1.25rem] leading-relaxed text-ink">{selected.challengeQuestion ?? selected.topicName}</p>
                </section>
                {isCompleteEvaluation(selected.evaluation) ? <EvaluationDetails evaluation={selected.evaluation} /> : null}
              </article>
            </div>
          ) : null}
          <Link href="/practice/topic" className="mt-8 text-[11px] tracking-[0.18em] text-cobalt">‹ TOPIC CHALLENGE</Link>
        </section>
      </div>
    </main>
  );
}