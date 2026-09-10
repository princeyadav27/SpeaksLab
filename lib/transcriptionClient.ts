// Browser-side transcription pipeline used by the Topic Challenge flow and the
// My Recordings page.
//
// Strategy (keeps provider 25 MB limits, serverless 4.5 MB limits, memory, and latency in check):
// 1. Small enough to upload as-is?  -> send the original blob in ONE request
//    (short audio or small clips ≤ DIRECT_UPLOAD_BYTES fit; fastest path).
// 2. Larger than that (e.g. a 3–10+ minute camera video)? -> decode the audio
//    track in the browser, resample to Whisper-native 16 kHz mono, slice it
//    into request-sized WAV segments (≤ 90 seconds each, ~2.88 MB), upload each
//    segment sequentially, and merge the transcripts in order.
//
// The HTTP contract with /api/transcribe is unchanged:
//   200 -> { transcript, model }
//   otherwise -> { error } (with a useful status).

import {
  MAX_UPLOAD_BYTES,
  TARGET_SAMPLE_RATE,
  mergeTranscriptChunks,
  planWavChunks,
  shouldUploadDirectly,
  wavBytesFromPcm16,
} from "./transcriptionShared";

export type TranscriptionProgress = (message: string) => void;

export type TranscribeOptions = {
  /** Shown before the pipeline knows the true audio length. */
  onStatus?: TranscriptionProgress;
};

type AudioSegmentBlob = {
  index: number;
  seconds: number;
  blob: Blob;
};

/**
 * Upload one file to /api/transcribe and return its transcript text.
 * When `allowEmpty` is true, an empty result is a valid silent segment
 * (inside a chunked long recording) and returns "" instead of failing.
 */
async function postForTranscript(
  file: Blob,
  fileName: string,
  options: { allowEmpty?: boolean } = {},
): Promise<string> {
  const formData = new FormData();
  formData.append("file", file, fileName);
  if (options.allowEmpty) formData.append("allowEmpty", "1");

  const response = await fetch("/api/transcribe", {
    method: "POST",
    body: formData,
  });

  const data = (await response.json().catch(() => null)) as {
    transcript?: string;
    error?: string;
  } | null;

  if (!response.ok) {
    throw new Error(data?.error ?? "Transcription failed.");
  }
  const text = (data?.transcript ?? "").trim();
  if (!text && !options.allowEmpty) {
    throw new Error(data?.error ?? "No speech was detected in the recording.");
  }
  return text;
}

/** Pick a sensible file name extension for the original recording. */
function extensionFor(blob: Blob): string {
  const type = blob.type.toLowerCase();
  if (type.includes("ogg")) return "ogg";
  if (type.includes("mp4") || type.includes("quicktime") || type.includes("m4a")) return "mp4";
  if (type.includes("wav") || type.includes("wave")) return "wav";
  if (type.includes("mp3")) return "mp3";
  return "webm";
}

function browserAudioContext(): AudioContext {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) {
    throw new Error("This browser does not support audio decoding for transcription.");
  }
  return new Ctor();
}

/**
 * Decode the recording's audio track in the browser and re-encode it as
 * request-sized 16 kHz mono WAV segments.
 */
async function extractWavSegments(blob: Blob): Promise<AudioSegmentBlob[]> {
  const context = browserAudioContext();
  try {
    const arrayBuffer = await blob.arrayBuffer();
    let decoded: AudioBuffer;
    try {
      decoded = await context.decodeAudioData(arrayBuffer.slice(0));
    } catch {
      throw new Error(
        "Your browser could not decode the audio track from this recording. Try re-recording with audio enabled, or use Chrome/Edge/Firefox.",
      );
    }

    const totalSeconds = decoded.duration;
    if (!Number.isFinite(totalSeconds) || totalSeconds < 0.5) {
      throw new Error("The recording is too short to transcribe.");
    }

    const segments = planWavChunks(totalSeconds);
    const results: AudioSegmentBlob[] = [];

    for (let i = 0; i < segments.length; i += 1) {
      const segment = segments[i];
      const frameCount = Math.max(1, Math.ceil(segment.seconds * TARGET_SAMPLE_RATE));
      const offline = new OfflineAudioContext(1, frameCount, TARGET_SAMPLE_RATE);

      const source = offline.createBufferSource();
      source.buffer = decoded;
      source.connect(offline.destination);
      // Play only this segment's slice of the source buffer. Rendering at a
      // different sample rate (e.g. 48 kHz recording -> 16 kHz) resamples
      // automatically; offsets are in source-time seconds.
      source.start(0, segment.start, segment.seconds);

      const rendered = await offline.startRendering();
      const wavBytes = wavBytesFromPcm16(rendered.getChannelData(0));
      results.push({
        index: i,
        seconds: segment.seconds,
        blob: new Blob([wavBytes.buffer as ArrayBuffer], { type: "audio/wav" }),
      });
    }

    return results;
  } finally {
    void context.close().catch(() => undefined);
  }
}

/**
 * Transcribe a saved recording (audio or video blob) into a single transcript
 * string. Reports pipeline progress through `onStatus`.
 */
export async function transcribeRecording(
  blob: Blob,
  options: TranscribeOptions = {},
): Promise<string> {
  const { onStatus } = options;
  const report = (message: string) => {
    try {
      onStatus?.(message);
    } catch {
      // Progress reporting must never break transcription.
    }
  };

  // Fast path: the file fits in one request — send it unchanged.
  if (shouldUploadDirectly(blob.size)) {
    report("Transcribing…");
    return postForTranscript(blob, `recording.${extensionFor(blob)}`);
  }

  // Long-recording path: extract + normalize audio, then chunked uploads.
  report("Preparing the recording for transcription…");
  let segments: AudioSegmentBlob[];
  try {
    segments = await extractWavSegments(blob);
  } catch (extractError) {
    // If browser audio decode fails (e.g. video container not decoded by Web Audio)
    // but the file is within server provider limits, attempt direct upload fallback.
    if (blob.size <= MAX_UPLOAD_BYTES) {
      report("Transcribing…");
      return postForTranscript(blob, `recording.${extensionFor(blob)}`);
    }
    throw extractError;
  }

  if (segments.length === 0) {
    throw new Error("No audio was found in the recording.");
  }

  const transcripts: string[] = [];
  for (const segment of segments) {
    const label =
      segments.length === 1
        ? "Transcribing…"
        : `Transcribing audio (part ${segment.index + 1} of ${segments.length})…`;
    report(label);
    const transcript = await postForTranscript(
      segment.blob,
      `audio-part-${segment.index + 1}.wav`,
      { allowEmpty: true },
    );
    transcripts.push(transcript);
  }

  return mergeTranscriptChunks(transcripts);
}
