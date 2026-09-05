"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getCategories, getCategoryById } from "@/lib/categories";
import {
  TYPE_LABELS,
  type Topic,
  type TopicDifficulty,
} from "@/lib/topics";
import {
  buildSpinSequence,
  pickTopic,
} from "@/lib/topicEngine";
import {
  emptyTopicChallengeSnapshot,
  readTopicChallengeState,
  subscribeTopicChallenge,
  TOPIC_HISTORY_LIMIT,
  writeTopicChallengeState,
} from "@/lib/topicChallengeState";
import TopicWheel from "./TopicWheel";
import {
  saveRecording,
  deleteRecording,
  type SavedRecording,
} from "@/lib/recordingsDb";
import RecordingPlayback from "@/components/recordings/RecordingPlayback";
import {
  CategoryIcon,
  CheckIcon,
  ChevronDown,
  ClockIcon,
  CubeIcon,
  LayersIcon,
  SparkleIcon,
  SpeakerIcon,
  SpeakerMutedIcon,
  TargetIcon,
} from "./topicIcons";

const DIFFICULTIES: TopicDifficulty[] = ["easy", "medium", "hard"];
const PREP_OPTIONS = [1, 3, 5, 10, 15];
const DEFAULT_CATEGORY = "ai-engineering";

function formatCountdown(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatRecordingTime(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function cubicBezierComponent(t: number, first: number, second: number) {
  const inverse = 1 - t;
  return 3 * inverse * inverse * t * first + 3 * inverse * t * t * second + t * t * t;
}

// cubic-bezier(0.25, 0.1, 0.25, 1) — the CSS `ease` curve.
//
// The previous curve, cubic-bezier(0.12, 0.7, 0.18, 1), front-loaded the spin
// so aggressively that ~89% of the rotation happened in the first 40% of the
// animation. The question text therefore stopped changing at ~60% while the
// wheel was still visibly turning for another second, which read as the text
// and the wheel being out of sync. This curve keeps a clear deceleration but
// spreads the rotation across the whole duration.
function cubicBezierProgress(t: number) {
  let lower = 0;
  let upper = 1;
  let sample = t;

  for (let iteration = 0; iteration < 20; iteration += 1) {
    const x = cubicBezierComponent(sample, 0.25, 0.25);
    if (x < t) lower = sample;
    else upper = sample;
    sample = (lower + upper) / 2;
  }

  return cubicBezierComponent(sample, 0.1, 1);
}

export default function SpinExperience() {
  const categories = useMemo(() => getCategories(), []);
  const stored = useSyncExternalStore(
    subscribeTopicChallenge,
    readTopicChallengeState,
    () => emptyTopicChallengeSnapshot,
  );

  const categoryId = stored.categoryId ?? DEFAULT_CATEGORY;
  const difficulty = stored.difficulty;
  const category = getCategoryById(categoryId);

  const [menuOpen, setMenuOpen] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [preview, setPreview] = useState<Topic | null>(null);
  const [finalTopic, setFinalTopic] = useState<Topic | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [prepStep, setPrepStep] = useState<"idle" | "select" | "countdown" | "expired">("idle");
  const [prepMinutes, setPrepMinutes] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [notes, setNotes] = useState("");
  const [recordState, setRecordState] = useState<"hidden" | "setup" | "recording" | "review">("hidden");
  const [recordMode, setRecordMode] = useState<"camera-mic" | "mic-only">("camera-mic");
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordingType, setRecordingType] = useState<"video" | "audio">("video");
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [transcribingRecordingId, setTranscribingRecordingId] = useState<string | null>(null);
  const [savedRecordings, setSavedRecordings] = useState<SavedRecording[]>([]);
  const recordedPreviewUrlRef = useRef<string | null>(null);
  const spinFrameRef = useRef<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const deadlineRef = useRef<number | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingIntervalRef = useRef<number | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const spinAudioRef = useRef<{
    context: AudioContext;
    master: GainNode;
    noiseSource: AudioBufferSourceNode;
    noiseGain: GainNode;
    tone: OscillatorNode;
    toneGain: GainNode;
  } | null>(null);

  const displayed = preview ?? finalTopic;
  const landed = Boolean(finalTopic) && !spinning;

  useEffect(() => {
    if (!finalTopic && prepStep !== "idle") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPrepStep("idle");
      setPrepMinutes(null);
      setRemainingSeconds(0);
      deadlineRef.current = null;
      setNotes("");
    }
  }, [finalTopic, prepStep]);

  useEffect(() => {
    if (prepStep !== "countdown" || prepMinutes === null || !finalTopic) {
      return;
    }

    if (!deadlineRef.current) {
      deadlineRef.current = Date.now() + prepMinutes * 60 * 1000;
    }

    const tick = () => {
      if (!deadlineRef.current) return;

      const nextSeconds = Math.max(
        0,
        Math.ceil((deadlineRef.current - Date.now()) / 1000),
      );

      setRemainingSeconds(nextSeconds);

      if (nextSeconds <= 0) {
        deadlineRef.current = null;
        setRemainingSeconds(0);
        setPrepStep("expired");
      }
    };

    tick();
    const intervalId = window.setInterval(tick, 250);

    return () => window.clearInterval(intervalId);
  }, [prepStep, prepMinutes, finalTopic]);

  useEffect(() => {
    return () => {
      if (spinFrameRef.current !== null) {
        window.cancelAnimationFrame(spinFrameRef.current);
      }
      if (recordingIntervalRef.current) {
        window.clearInterval(recordingIntervalRef.current);
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (recordedPreviewUrlRef.current) {
        URL.revokeObjectURL(recordedPreviewUrlRef.current);
        recordedPreviewUrlRef.current = null;
      }
      if (spinAudioRef.current) {
        const { context, noiseSource, tone } = spinAudioRef.current;
        try {
          noiseSource.stop();
        } catch {
          // no-op
        }
        try {
          tone.stop();
        } catch {
          // no-op
        }
        void context.close();
        spinAudioRef.current = null;
      }
      if (audioContextRef.current) {
        void audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function persist(partial: {
    categoryId?: string | null;
    difficulty?: TopicDifficulty;
    topicId?: string | null;
    history?: string[];
  }) {
    writeTopicChallengeState({
      categoryId,
      difficulty,
      mode: "random",
      topicId: finalTopic?.id ?? stored.topicId,
      history: stored.history,
      step: "spin",
      ...partial,
    });
  }

  function clearSpinAnimation() {
    if (spinFrameRef.current !== null) {
      window.cancelAnimationFrame(spinFrameRef.current);
      spinFrameRef.current = null;
    }
  }

  function createWheelNoise(context: AudioContext): AudioBuffer {
    const length = context.sampleRate * 2;
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i += 1) {
      const envelope = 1 - i / length;
      data[i] = (Math.random() * 2 - 1) * envelope * 0.7;
    }

    return buffer;
  }

  const startSpinSound = useCallback(() => {
    if (!soundOn || typeof window === "undefined") return;

    const AudioCtor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;

    if (!AudioCtor) return;

    if (spinAudioRef.current) {
      const { context, master } = spinAudioRef.current;
      if (context.state === "suspended") {
        void context.resume();
      }
      master.gain.cancelScheduledValues(context.currentTime);
      master.gain.setTargetAtTime(0.09, context.currentTime, 0.08);
      return;
    }

    const context = audioContextRef.current ?? new AudioCtor();
    audioContextRef.current = context;

    if (context.state === "suspended") {
      void context.resume();
    }

    const master = context.createGain();
    master.gain.value = 0.0001;
    master.connect(context.destination);

    const noiseBuffer = createWheelNoise(context);
    const noiseSource = context.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    const noiseFilter = context.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 900;
    noiseFilter.Q.value = 0.7;

    const noiseGain = context.createGain();
    noiseGain.gain.value = 0.11;

    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(master);

    const tone = context.createOscillator();
    tone.type = "sawtooth";
    tone.frequency.value = 120;

    const toneGain = context.createGain();
    toneGain.gain.value = 0.025;

    tone.connect(toneGain);
    toneGain.connect(master);

    noiseSource.start();
    tone.start();

    master.gain.setTargetAtTime(0.09, context.currentTime, 0.08);
    tone.frequency.setTargetAtTime(180, context.currentTime, 0.2);
    tone.frequency.setTargetAtTime(75, context.currentTime + 0.5, 0.4);

    spinAudioRef.current = {
      context,
      master,
      noiseSource,
      noiseGain,
      tone,
      toneGain,
    };
  }, [soundOn]);

  const stopSpinSound = useCallback(() => {
    if (!spinAudioRef.current) return;

    const { context, master, noiseSource, tone } = spinAudioRef.current;
    master.gain.cancelScheduledValues(context.currentTime);
    master.gain.setTargetAtTime(0.0001, context.currentTime, 0.12);

    window.setTimeout(() => {
      try {
        noiseSource.stop();
      } catch {
        // no-op
      }
      try {
        tone.stop();
      } catch {
        // no-op
      }
      spinAudioRef.current = null;
    }, 180);
  }, []);

  function playWheelTick() {
    if (!soundOn) return;

    const AudioCtor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;

    if (!AudioCtor) return;

    const context = audioContextRef.current ?? new AudioCtor();
    audioContextRef.current = context;

    if (context.state === "suspended") {
      void context.resume();
    }

    // Create a short tick sound using an oscillator
    const tickOsc = context.createOscillator();
    const tickGain = context.createGain();
    
    tickOsc.frequency.value = 800; // Higher frequency for a click
    tickOsc.type = "sine";
    
    tickGain.gain.setValueAtTime(0.15, context.currentTime);
    tickGain.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.05);
    
    tickOsc.connect(tickGain);
    tickGain.connect(context.destination);
    
    tickOsc.start(context.currentTime);
    tickOsc.stop(context.currentTime + 0.05);
  }

  useEffect(() => {
    if (spinning && soundOn) {
      startSpinSound();
    } else {
      stopSpinSound();
    }
  }, [spinning, soundOn, startSpinSound, stopSpinSound]);

  function spin() {
    if (spinning) return;
    // Recently landed topics, so each spin lands on a new question. Older
    // snapshots stored only the last topic; fall back to that when history
    // is empty so the first spin after an upgrade still changes.
    const landedId = finalTopic?.id ?? stored.topicId;
    const recentTopicIds =
      stored.history.length > 0 ? stored.history : landedId ? [landedId] : [];
    const nextHistory = (id: string) =>
      [...recentTopicIds, id].slice(-TOPIC_HISTORY_LIMIT);
    const fallbackTopic = pickTopic(categoryId, difficulty, recentTopicIds);
    if (!fallbackTopic) {
      setRecordError(
        `No questions available for ${category?.name ?? "this category"} at ${difficulty} difficulty. Please try a different difficulty or category.`
      );
      return;
    }

    // Browsers permit audio initialization from the Spin button interaction.
    if (soundOn) startSpinSound();
    clearSpinAnimation();
    setMenuOpen(false);
    setFinalTopic(null);
    persist({ topicId: null, categoryId, difficulty });
    setSpinning(true);
    setPreview(fallbackTopic);

    const chosen = fallbackTopic;

    if (prefersReducedMotion()) {
      setPreview(chosen);
      setFinalTopic(chosen);
      setSpinning(false);
      persist({
        topicId: chosen.id,
        categoryId,
        difficulty,
        history: nextHistory(chosen.id),
      });
      return;
    }

    const sequence = buildSpinSequence(chosen, 18);
    setPreview(sequence[0] ?? chosen);
    const startRotation = rotation;
    const totalRotation = 720 + Math.floor(Math.random() * 180);
    const duration = 2600;
    const startedAt = performance.now();
    let previousIndex = 0;

    const animate = (now: number) => {
      const rawProgress = Math.min(1, (now - startedAt) / duration);
      const progress = cubicBezierProgress(rawProgress);
      // round(), not floor(): the bisection converges to ~0.99999995 at t=1,
      // so floor() could never select the final slot during the animation and
      // the landing question only appeared via the completion branch below.
      const index = Math.min(
        sequence.length - 1,
        Math.round(progress * (sequence.length - 1)),
      );

      setRotation(startRotation + totalRotation * progress);
      if (index !== previousIndex) {
        previousIndex = index;
        setPreview(sequence[index]);
        playWheelTick();
      }

      if (rawProgress >= 1) {
        const landedTopic = sequence[sequence.length - 1] ?? chosen;
        setPreview(landedTopic);
        setFinalTopic(landedTopic);
        setSpinning(false);
        spinFrameRef.current = null;
        persist({
          topicId: landedTopic.id,
          categoryId,
          difficulty,
          history: nextHistory(landedTopic.id),
        });
        return;
      }

      spinFrameRef.current = window.requestAnimationFrame(animate);
    };

    spinFrameRef.current = window.requestAnimationFrame(animate);
  }

  function selectDifficulty(next: TopicDifficulty) {
    if (spinning) return;
    setFinalTopic(null);
    setPreview(null);
    persist({ difficulty: next, topicId: null });
  }

  function selectCategory(id: string) {
    if (spinning) return;
    setMenuOpen(false);
    setFinalTopic(null);
    setPreview(null);
    setPrepStep("idle");
    setPrepMinutes(null);
    setRemainingSeconds(0);
    deadlineRef.current = null;
    setNotes("");
    persist({ categoryId: id, topicId: null });
  }

  function beginPreparation(minutes: number) {
    if (!finalTopic) return;
    setPrepMinutes(minutes);
    setRemainingSeconds(minutes * 60);
    // eslint-disable-next-line
    deadlineRef.current = Date.now() + minutes * 60 * 1000;
    setPrepStep("countdown");
  }

  function clearRecordingTimer() {
    if (recordingIntervalRef.current) {
      window.clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
  }

  function resetMediaStream() {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (videoPreviewRef.current) {
      videoPreviewRef.current.srcObject = null;
    }
  }

  async function prepareRecordingCapture() {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setRecordError("This browser does not support recording from the microphone or camera.");
      return;
    }

    resetMediaStream();

    const wantsVideo = recordMode === "camera-mic" && cameraEnabled;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: wantsVideo,
      });

      mediaStreamRef.current = stream;
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
      }
      setRecordError(null);
    } catch {
      setRecordError("Microphone or camera permission was blocked. Please allow access and try again.");
    }
  }

  function startRecording() {
    if (!mediaStreamRef.current) {
      void prepareRecordingCapture();
      setRecordError("Your microphone or camera is not ready yet. Please try again.");
      return;
    }

    if (typeof MediaRecorder === "undefined") {
      setRecordError("Recording is not supported in this browser.");
      return;
    }

    const wantsVideo = recordMode === "camera-mic" && cameraEnabled;
    const mimeTypes = wantsVideo
      ? ["video/webm;codecs=vp9,opus", "video/webm"]
      : ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
    const mimeType = mimeTypes.find((type) => MediaRecorder.isTypeSupported(type));
    const recorder = new MediaRecorder(
      mediaStreamRef.current,
      mimeType ? { mimeType } : undefined,
    );

    recordedChunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunksRef.current.push(event.data);
      }
    };
    recorder.onerror = () => {
      setRecordError("There was a problem while recording. Please try again.");
    };
    recorder.onstop = () => {
      const blobType = recorder.mimeType || (wantsVideo ? "video/webm" : "audio/webm");
      const blob = new Blob(recordedChunksRef.current, { type: blobType });

      if (recordedPreviewUrlRef.current) {
        URL.revokeObjectURL(recordedPreviewUrlRef.current);
      }

      const nextUrl = URL.createObjectURL(blob);
      recordedPreviewUrlRef.current = nextUrl;
      setRecordedUrl(nextUrl);
      setRecordingType(recordMode === "camera-mic" && cameraEnabled ? "video" : "audio");
      setRecordState("review");
      setRecordError(null);
      clearRecordingTimer();
      resetMediaStream();
      mediaRecorderRef.current = null;
    };

    recorder.start();
    mediaRecorderRef.current = recorder;
    setRecordingDuration(0);
    setRecordState("recording");
    setRecordError(null);

    recordingIntervalRef.current = window.setInterval(() => {
      setRecordingDuration((current) => current + 1);
    }, 1000);
  }

  function stopRecording() {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") {
      return;
    }
    mediaRecorderRef.current.stop();
    clearRecordingTimer();
  }

  function recordAgain() {
    clearRecordingTimer();
    setRecordingDuration(0);
    // Revoke the previous preview URL in the next tick to avoid cutting off the player
    if (recordedPreviewUrlRef.current) {
      const urlToRevoke = recordedPreviewUrlRef.current;
      window.setTimeout(() => {
        URL.revokeObjectURL(urlToRevoke);
        recordedPreviewUrlRef.current = null;
      }, 0);
    }
    setRecordedUrl(null);
    setRecordError(null);
    setRecordState("setup");
    void prepareRecordingCapture();
  }

  async function finishRecording() {
    if (transcribingRecordingId) return;
    clearRecordingTimer();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    resetMediaStream();

    if (!displayed || !recordedUrl) {
      setRecordError("No recording is available to save yet.");
      return;
    }

    try {
      const response = await fetch(recordedUrl);
      const blob = await response.blob();
      const categoryName = category?.name ?? "Unknown Category";

      if (recordedPreviewUrlRef.current) {
        URL.revokeObjectURL(recordedPreviewUrlRef.current);
        recordedPreviewUrlRef.current = null;
      }

      const recordingId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      // Save recording without transcript first
      const recording: SavedRecording = {
        id: recordingId,
        topicId: displayed.id,
        topicName: displayed.title,
        challengeQuestion: displayed.title,
        categoryId: categoryId,
        categoryName,
        difficulty,
        prepMinutes: prepMinutes ?? 0,
        notes: notes.trim() ? notes.trim() : undefined,
        durationSeconds: recordingDuration,
        createdAt: new Date().toISOString(),
        blob,
      };

      await saveRecording(recording);
      setSavedMessage("Recording saved locally. Transcribing...");
      setSavedRecordings((current) => [recording, ...current]);
      setTranscribingRecordingId(recording.id);

      // Attempt transcription
      const formData = new FormData();
      const transcriptionExtension = blob.type.includes("ogg")
        ? "ogg"
        : blob.type.includes("mp4")
          ? "mp4"
          : "webm";
      formData.append("file", blob, `recording.${transcriptionExtension}`);

      const transcriptionResponse = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      if (transcriptionResponse.ok) {
        const transcriptionData = (await transcriptionResponse.json()) as { transcript?: string };
        if (transcriptionData.transcript?.trim()) {
          // Update recording with transcript
          const updatedRecording: SavedRecording = {
            ...recording,
            transcript: transcriptionData.transcript,
          };
          await saveRecording(updatedRecording);
          setSavedRecordings((current) =>
            current.map((item) => item.id === updatedRecording.id ? updatedRecording : item),
          );
          setSavedMessage("Recording and transcript saved.");
        } else {
          setSavedMessage("Recording saved, but transcription returned no speech.");
        }
      } else {
        const transcriptionData = (await transcriptionResponse.json().catch(() => null)) as { error?: string } | null;
        setSavedMessage(
          `Recording saved, but transcription failed: ${transcriptionData?.error ?? "the transcription service is unavailable."}`,
        );
      }

      setRecordState("hidden");
      setTranscribingRecordingId(null);
      setRecordError(null);
      setRecordingDuration(0);
      setRecordedUrl(null);
    } catch {
      setTranscribingRecordingId(null);
      setRecordError("There was a problem saving the recording locally. Please try again.");
    }
  }

  async function handleDeleteRecording(id: string) {
    try {
      await deleteRecording(id);
      setSavedRecordings((current) => current.filter((recording) => recording.id !== id));
    } catch {
      setRecordError("The recording could not be deleted.");
    }
  }

  useEffect(() => {
    if (!recordedUrl) return;

    return () => {
      if (recordedPreviewUrlRef.current) {
        URL.revokeObjectURL(recordedPreviewUrlRef.current);
        recordedPreviewUrlRef.current = null;
      }
    };
  }, [recordedUrl]);

  const categoryList = (
    <ul
      role="listbox"
      aria-label="Categories"
      className="rounded-2xl border border-ink/10 bg-[#fbf7ef] py-2 shadow-[0_14px_40px_rgba(22,22,22,0.06)]"
    >
      {categories.map((item) => {
        const active = item.id === categoryId;
        return (
          <li key={item.id}>
            <button
              type="button"
              role="option"
              aria-selected={active}
              disabled={spinning}
              onClick={() => selectCategory(item.id)}
              className={`relative flex w-full items-center gap-3 px-3.5 py-[0.55rem] text-left text-[13.5px] ${
                active ? "text-cobalt" : "text-ink/75 hover:bg-ink/[0.03]"
              }`}
            >
              {active ? (
                <span
                  className="absolute bottom-1.5 left-0 top-1.5 w-[2px] rounded-full bg-cobalt"
                  aria-hidden="true"
                />
              ) : null}
              <CategoryIcon id={item.id} className="h-[16px] w-[16px] shrink-0" />
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              {active ? <CheckIcon className="h-3.5 w-3.5 shrink-0" /> : null}
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <section className="mx-auto w-full max-w-[1180px] px-5 pb-10 pt-5 sm:px-8 lg:px-10">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-[11px] tracking-[0.18em] text-cobalt"
      >
        ‹ TOPIC CHALLENGE
      </Link>

      <div className="mt-5 grid grid-cols-1 gap-x-8 gap-y-4 lg:grid-cols-[248px_minmax(0,1fr)_minmax(320px,400px)]">
        <div ref={menuRef} className="relative">
          <p className="text-[13px] text-ink/65">1. Choose a Category</p>
          <button
            type="button"
            onClick={() => !spinning && setMenuOpen((value) => !value)}
            disabled={spinning}
            className="mt-2 flex w-full items-center justify-between rounded-2xl border border-ink/10 bg-[#fbf7ef] px-3.5 py-2.5 text-left"
            aria-expanded={menuOpen}
            aria-haspopup="listbox"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <CategoryIcon
                id={categoryId}
                className="h-4 w-4 shrink-0 text-ink/70"
              />
              <span className="truncate text-[14px] text-ink">
                {category?.name ?? "Select"}
              </span>
            </span>
            <ChevronDown className="h-4 w-4 text-ink/35" />
          </button>
          <div className="absolute left-0 right-0 z-20 mt-2 lg:hidden">
            {menuOpen ? categoryList : null}
          </div>
        </div>

        <div>
          <p className="text-[13px] text-ink/65">2. Difficulty</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {DIFFICULTIES.map((level) => {
              const active = difficulty === level;
              return (
                <button
                  key={level}
                  type="button"
                  onClick={() => selectDifficulty(level)}
                  disabled={spinning}
                  className={`rounded-full px-[1.15rem] py-2 text-[13px] capitalize ${
                    active
                      ? "bg-cobalt text-ivory"
                      : "bg-[#efe8da] text-ink/70"
                  }`}
                >
                  {level}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-ink/65">3. Mode</p>
            <div className="mt-2 flex max-w-[220px] items-center justify-between rounded-2xl border border-ink/10 bg-[#fbf7ef] px-3.5 py-2.5 text-[14px] text-ink">
              <span className="flex items-center gap-2.5">
                <CubeIcon className="h-4 w-4 text-ink/70" />
                Random
              </span>
              <ChevronDown className="h-4 w-4 text-ink/35" />
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSoundOn((value) => !value)}
            aria-pressed={soundOn}
            aria-label={soundOn ? "Sound on" : "Sound off"}
            className="mt-7 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-ink/10 bg-[#fbf7ef] text-ink/55"
          >
            {soundOn ? (
              <SpeakerIcon className="h-[18px] w-[18px]" />
            ) : (
              <SpeakerMutedIcon className="h-[18px] w-[18px]" />
            )}
          </button>
        </div>

        <div className="hidden lg:block">{categoryList}</div>

        <div className="flex flex-col items-center pt-4 lg:pt-8">
          <TopicWheel
            spinning={spinning}
            rotation={rotation}
            disabled={spinning}
            onSpin={spin}
          />
          <h2 className="mt-8 text-center font-display text-[1.7rem] text-ink">
            Spin to get your challenge
          </h2>
          <p className="mt-2 max-w-[20rem] text-center text-[14px] leading-relaxed text-ink/55">
            Each question is curated to help you think deeper and speak better.
          </p>
        </div>

        <article className="flex min-h-[28rem] flex-col rounded-2xl border border-ink/10 bg-[#fbf7ef] p-6 sm:p-7">
          {recordState !== "hidden" && displayed ? (
            <>
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-[11px] font-medium tracking-[0.2em] text-cobalt">
                  RECORDING
                </p>
                <div className="flex items-center gap-2 rounded-full border border-ink/10 bg-[#f4ecdf] px-2 py-1 text-[11px] uppercase tracking-[0.14em] text-ink/60">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      recordState === "recording" ? "bg-[#d64a4a]" : "bg-emerald-500"
                    }`}
                  />
                  {recordState === "recording" ? "Live" : "Ready"}
                </div>
              </div>

              <h3 className="font-display text-[1.75rem] leading-snug text-ink">
                {displayed.title}
              </h3>

              <div className="mt-4">
                <p className="text-[14px] font-medium text-ink">Now explain it in your own words.</p>
                <p className="mt-1 text-[13px] text-ink/55">No script. No notes.</p>
              </div>

              <div className="mt-5 rounded-2xl border border-ink/10 bg-[#f5efe5] p-3">
                <div className="mb-3 flex items-center justify-between gap-3 text-[12px] uppercase tracking-[0.16em] text-ink/45">
                  <span>Microphone</span>
                  <span>{recordState === "recording" ? "Recording" : "Standby"}</span>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setRecordMode("camera-mic")}
                      className={`rounded-full px-3 py-1.5 text-[12px] ${
                        recordMode === "camera-mic" ? "bg-cobalt text-ivory" : "bg-[#efe8da] text-ink/70"
                      }`}
                    >
                      Camera + Microphone
                    </button>
                    <button
                      type="button"
                      onClick={() => setRecordMode("mic-only")}
                      className={`rounded-full px-3 py-1.5 text-[12px] ${
                        recordMode === "mic-only" ? "bg-cobalt text-ivory" : "bg-[#efe8da] text-ink/70"
                      }`}
                    >
                      Microphone only
                    </button>
                  </div>

                  {recordMode === "camera-mic" ? (
                    <button
                      type="button"
                      onClick={() => setCameraEnabled((value) => !value)}
                      className="rounded-full border border-ink/10 bg-[#fbf7ef] px-2.5 py-1.5 text-[11px] uppercase tracking-[0.14em] text-ink/70"
                    >
                      Camera {cameraEnabled ? "On" : "Off"}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mt-5 overflow-hidden rounded-2xl border border-ink/10 bg-[#f5efe5]">
                {recordState === "review" && recordedUrl ? (
                  recordingType === "video" ? (
                    <video
                      src={recordedUrl}
                      controls
                      playsInline
                      className="h-[220px] w-full object-cover"
                    />
                  ) : (
                    <audio src={recordedUrl} controls className="w-full" />
                  )
                ) : (
                  <div className="flex h-[220px] items-center justify-center bg-[#efe7d9] p-4">
                    {recordMode === "camera-mic" && cameraEnabled ? (
                      <video
                        ref={videoPreviewRef}
                        autoPlay
                        muted
                        playsInline
                        className="h-full w-full -scale-x-100 rounded-xl object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center rounded-xl border border-dashed border-ink/15 text-center text-ink/50">
                        <p className="font-display text-[1.4rem] text-ink">Mic only</p>
                        <p className="mt-2 text-[12px] uppercase tracking-[0.18em] text-ink/40">
                          Camera disabled
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-ink/10 bg-[#f5efe5] p-3">
                <div>
                  <p className="text-[12px] uppercase tracking-[0.18em] text-ink/45">Recording timer</p>
                  <p className="mt-1 font-display text-[1.8rem] leading-none text-ink">
                    {formatRecordingTime(recordingDuration)}
                  </p>
                </div>
                <div className="text-right text-[12px] text-ink/60">
                  <p>Mic: {recordState === "recording" ? "Live" : "Ready"}</p>
                  <p>Camera: {cameraEnabled ? "On" : "Off"}</p>
                </div>
              </div>

              {recordError ? (
                <p className="mt-4 rounded-xl border border-[#d77f7f]/30 bg-[#f8e6e6] px-3 py-2 text-[13px] text-[#8b3c3c]">
                  {recordError}
                </p>
              ) : null}

              {recordState === "setup" || recordState === "recording" ? (
                <div className="mt-5 flex gap-3">
                  {recordState === "setup" ? (
                    <button
                      type="button"
                      onClick={startRecording}
                      className="flex-1 rounded-md bg-cobalt py-3 text-[15px] font-medium text-ivory hover:bg-cobalt-deep"
                    >
                      Start Recording
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="flex-1 rounded-md bg-[#bb3d3d] py-3 text-[15px] font-medium text-ivory hover:bg-[#9c2e2e]"
                    >
                      Stop Recording
                    </button>
                  )}
                </div>
              ) : (
                <div className="mt-5 flex gap-3">
                  <button
                    type="button"
                    onClick={recordAgain}
                    disabled={Boolean(transcribingRecordingId)}
                    className="flex-1 rounded-md border border-ink/10 bg-[#f4ecdf] py-3 text-[15px] font-medium text-ink hover:border-cobalt/40 hover:text-cobalt disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Record Again
                  </button>
                  <button
                    type="button"
                    onClick={finishRecording}
                    disabled={Boolean(transcribingRecordingId)}
                    className="flex-1 rounded-md bg-cobalt py-3 text-[15px] font-medium text-ivory hover:bg-cobalt-deep disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {transcribingRecordingId ? "Transcribing..." : "Finish Recording →"}
                  </button>
                </div>
              )}
            </>
          ) : prepStep === "select" && displayed ? (
            <>
              <p className="text-[11px] font-medium tracking-[0.2em] text-cobalt">
                PREPARATION
              </p>
              <h3 className="mt-4 font-display text-[1.8rem] leading-snug text-ink">
                {displayed.title}
              </h3>
              <p className="mt-3 text-[14px] leading-relaxed text-ink/60">
                {displayed.prompt}
              </p>

              <div className="mt-6 border-t border-ink/10 pt-5">
                <p className="text-[15px] font-medium text-ink">
                  How much time do you need?
                </p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {PREP_OPTIONS.map((minutes) => (
                    <button
                      key={minutes}
                      type="button"
                      onClick={() => beginPreparation(minutes)}
                      className="rounded-xl border border-ink/10 bg-[#f4ecdf] px-3 py-3 text-[14px] text-ink transition hover:border-cobalt/40 hover:text-cobalt"
                    >
                      {minutes} min
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : prepStep === "countdown" && displayed ? (
            <>
              <p className="text-[11px] font-medium tracking-[0.2em] text-cobalt">
                PREPARATION
              </p>

              <div className="mt-4 rounded-2xl border border-ink/10 bg-[#f5efe5] p-4">
                <p className="text-[12px] uppercase tracking-[0.18em] text-ink/45">
                  Countdown
                </p>
                <p className="mt-2 font-display text-[2.5rem] leading-none text-ink">
                  {formatCountdown(remainingSeconds)}
                </p>
              </div>

              <h3 className="mt-5 font-display text-[1.7rem] leading-snug text-ink">
                {displayed.title}
              </h3>
              <p className="mt-2 text-[14px] leading-relaxed text-ink/60">
                {displayed.prompt}
              </p>

              <label className="mt-6 block">
                <span className="mb-2 block text-[12px] uppercase tracking-[0.18em] text-ink/45">
                  Private notes
                </span>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={7}
                  placeholder="Jot down ideas, structure, examples, and talking points..."
                  className="w-full resize-none rounded-2xl border border-ink/10 bg-[#f9f3ea] p-3 text-[14px] text-ink placeholder:text-ink/35 focus:border-cobalt/40 focus:outline-none"
                />
              </label>
            </>
          ) : prepStep === "expired" && displayed ? (
            <>
              <p className="text-[11px] font-medium tracking-[0.2em] text-[#c45c5c]">
                TIME&apos;S UP
              </p>

              <h3 className="mt-4 font-display text-[1.8rem] leading-snug text-ink">
                {displayed.title}
              </h3>
              <p className="mt-3 text-[14px] leading-relaxed text-ink/60">
                {displayed.prompt}
              </p>

              <div className="mt-6 rounded-2xl border border-ink/10 bg-[#f5efe5] p-4">
                <p className="font-display text-[2rem] text-ink">Time&apos;s up.</p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setRecordState("setup");
                  setRecordError(null);
                  void prepareRecordingCapture();
                }}
                className="mt-auto w-full rounded-md bg-cobalt py-3 text-[15px] font-medium text-ivory hover:bg-cobalt-deep"
              >
                Ready to Speak →
              </button>
            </>
          ) : displayed ? (
            <>
              <p
                className={`text-[11px] font-medium tracking-[0.16em] ${
                  difficulty === "hard"
                    ? "text-[#c45c5c]"
                    : difficulty === "medium"
                      ? "text-cobalt"
                      : "text-ink/45"
                }`}
              >
                {difficulty.toUpperCase()}
              </p>
              <h3
                key={displayed.id}
                className="mt-3 font-display text-[1.55rem] leading-[1.22] text-ink sm:text-[1.8rem]"
                aria-live="polite"
              >
                {displayed.title}
              </h3>
              <p
                key={`${displayed.id}-prompt`}
                className="mt-4 text-[14px] leading-relaxed text-ink/55"
              >
                {displayed.prompt}
              </p>
              <div className="mt-6 space-y-4 border-t border-ink/10 pt-5">
                <div className="flex items-start gap-3">
                  <TargetIcon className="mt-0.5 h-4 w-4 text-ink/40" />
                  <p className="text-[13px] leading-snug">
                    <span className="block text-[12px] text-ink/40">
                      Category
                    </span>
                    <span className="text-ink">
                      {category?.name} &gt; {displayed.subcategory}
                    </span>
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <LayersIcon className="mt-0.5 h-4 w-4 text-ink/40" />
                  <p className="text-[13px] leading-snug">
                    <span className="block text-[12px] text-ink/40">Type</span>
                    <span className="text-ink">
                      {TYPE_LABELS[displayed.type]}
                    </span>
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <ClockIcon className="mt-0.5 h-4 w-4 text-ink/40" />
                  <p className="text-[13px] leading-snug">
                    <span className="block text-[12px] text-ink/40">
                      Estimated Time
                    </span>
                    <span className="text-ink">
                      ~ {displayed.estimatedMinutes} min
                    </span>
                  </p>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col justify-center">
              <p className="font-display text-[1.7rem] leading-snug text-ink">
                Your question will appear here.
              </p>
              <p className="mt-3 text-[14px] leading-relaxed text-ink/55">
                Spin to cycle real curated questions from this category, then
                land on one.
              </p>
            </div>
          )}

          {prepStep === "idle" && (
            <button
              type="button"
              disabled={!landed}
              onClick={() => {
                if (!landed || !displayed) return;
                setPrepStep("select");
                setNotes("");
              }}
              className={`mt-auto w-full rounded-md py-3 text-[15px] font-medium ${
                landed
                  ? "bg-cobalt text-ivory hover:bg-cobalt-deep"
                  : "cursor-not-allowed bg-cobalt/30 text-ivory/90"
              }`}
            >
              Start Timer →
            </button>
          )}
        </article>
      </div>

      <p className="mt-8 flex items-start gap-3 rounded-2xl border border-ink/10 px-5 py-4 text-[13px] leading-relaxed text-ink/60">
        <SparkleIcon className="mt-0.5 h-4 w-4 shrink-0 text-cobalt" />
        <span>
          Questions are selected to match your goals and improve your weak
          areas.
          <br />
          Keep practicing, keep improving.
        </span>
      </p>

      {savedMessage ? (
        <div className="mt-6 rounded-2xl border border-emerald-900/20 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-900">
          {savedMessage}
        </div>
      ) : null}

      <div className="mt-8 rounded-2xl border border-ink/10 bg-[#fbf7ef] p-5">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h3 className="font-display text-[1.8rem] text-ink">This Session</h3>
        </div>

        {savedRecordings.length === 0 ? (
          <p className="text-[14px] text-ink/55">No recordings saved yet.</p>
        ) : (
          <ul className="space-y-3">
            {savedRecordings.map((recording) => (
              <li key={recording.id} className="rounded-2xl border border-ink/10 bg-[#f5efe5] p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-display text-[1.2rem] text-ink">{recording.topicName}</p>
                    <p className="mt-1 text-[12px] uppercase tracking-[0.12em] text-ink/45">
                      {recording.categoryName} · {recording.difficulty}
                    </p>
                    <p className="mt-1 text-[12px] text-ink/55">
                      {new Date(recording.createdAt).toLocaleString()} · {formatRecordingTime(recording.durationSeconds)}
                    </p>
                    {recording.transcript ? (
                      <p className="mt-2 line-clamp-2 max-w-[34rem] text-[12px] leading-relaxed text-ink/60">
                        {recording.transcript}
                      </p>
                    ) : transcribingRecordingId === recording.id ? (
                      <p className="mt-2 text-[12px] text-cobalt">Transcribing...</p>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* RecordingPlayback owns and revokes its own object URL.
                        Creating the URL inline here leaked one per recording on
                        every render — and a spin re-renders ~60x/second. */}
                    <RecordingPlayback
                      recording={recording}
                      className={
                        recording.blob.type.includes("video")
                          ? "h-16 w-20 rounded-lg object-cover"
                          : "h-10"
                      }
                    />
                    <button
                      type="button"
                      onClick={() => void handleDeleteRecording(recording.id)}
                      className="rounded-md border border-ink/10 bg-[#fbf7ef] px-2.5 py-1.5 text-[12px] text-ink/70 hover:border-red-300 hover:text-red-700"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
