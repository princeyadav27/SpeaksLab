// Pure, dependency-free transcription helpers shared by the browser client,
// the /api/transcribe server route, and the regression test suite.
//
// These functions are deterministic and use no browser, Node, or Next.js
// globals so they can be unit-tested anywhere.

// ── Provider / transport limits ───────────────────────────────────────────────

/** Hard cap enforced by the server route and the Whisper API free tier. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * Files at or below this size are uploaded as-is (no decode, no chunking).
 * The margin below MAX_UPLOAD_BYTES leaves room for multipart/form-data
 * framing and provider-side decoding of container overhead.
 */
export const DIRECT_UPLOAD_BYTES = 24 * 1024 * 1024;

/**
 * Normalized transcription audio: 16 kHz mono 16-bit PCM.
 * 16 kHz is Whisper's native sample rate, mono matches the spoken single
 * speaker, and 16-bit PCM keeps speech quality lossless.
 */
export const TARGET_SAMPLE_RATE = 16000;
export const TARGET_CHANNELS = 1;
/** Bytes of encoded WAV per second of audio at the target format. */
export const WAV_BYTES_PER_SECOND = TARGET_SAMPLE_RATE * TARGET_CHANNELS * 2;

/**
 * Longest single WAV chunk uploaded in one request. 720 s of 16 kHz mono
 * 16-bit PCM ≈ 23.04 MB, safely under the 25 MB cap, so recordings up to
 * ~12 minutes are transcribed in a single request.
 */
export const MAX_CHUNK_SECONDS = 720;

// ── Chunk planning ────────────────────────────────────────────────────────────

export type AudioSegment = {
  /** Start offset into the source audio, in seconds. */
  start: number;
  /** Length of this segment, in seconds. */
  seconds: number;
};

/**
 * Split `totalSeconds` of audio into segments that each fit inside one
 * transcription request. Segments tile the full duration with no gaps and no
 * overlap, and preserve chronological order.
 */
export function planWavChunks(totalSeconds: number): AudioSegment[] {
  const total = Math.max(0, totalSeconds);
  if (total === 0) return [];

  const segments: AudioSegment[] = [];
  let cursor = 0;
  while (cursor < total) {
    const seconds = Math.min(MAX_CHUNK_SECONDS, total - cursor);
    segments.push({ start: cursor, seconds });
    cursor += seconds;
  }
  return segments;
}

/** Estimate of the encoded WAV size in bytes for `seconds` of audio. */
export function wavSizeForSeconds(seconds: number): number {
  // 44-byte RIFF/WAVE header + PCM payload.
  return 44 + Math.max(0, Math.round(seconds * WAV_BYTES_PER_SECOND));
}

/**
 * Should the original blob be uploaded without decoding or chunking?
 * True only when the file is small enough to fit in one request.
 */
export function shouldUploadDirectly(fileSizeBytes: number): boolean {
  return fileSizeBytes > 0 && fileSizeBytes <= DIRECT_UPLOAD_BYTES;
}

// ── WAV encoding ───────────────────────────────────────────────────────────────

/**
 * Encode 16-bit PCM samples (Float32Array in [-1, 1], mono) as a complete
 * WAV file (RIFF/WAVE header + PCM payload). Pure bytes — no Blob dependency,
 * so it works in browsers, Node, and tests alike.
 */
export function wavBytesFromPcm16(samples: Float32Array): Uint8Array {
  const sampleCount = samples.length;
  const dataSize = sampleCount * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // "RIFF"
  bytes[0] = 0x52; bytes[1] = 0x49; bytes[2] = 0x46; bytes[3] = 0x46;
  view.setUint32(4, 36 + dataSize, true);
  // "WAVE"
  bytes[8] = 0x57; bytes[9] = 0x41; bytes[10] = 0x56; bytes[11] = 0x45;
  // "fmt "
  bytes[12] = 0x66; bytes[13] = 0x6d; bytes[14] = 0x74; bytes[15] = 0x20;
  view.setUint32(16, 16, true);            // fmt chunk size
  view.setUint16(20, 1, true);             // PCM format
  view.setUint16(22, TARGET_CHANNELS, true);
  view.setUint32(24, TARGET_SAMPLE_RATE, true);
  view.setUint32(28, TARGET_SAMPLE_RATE * TARGET_CHANNELS * 2, true); // byte rate
  view.setUint16(32, TARGET_CHANNELS * 2, true);                       // block align
  view.setUint16(34, 16, true);            // bits per sample
  // "data"
  bytes[36] = 0x64; bytes[37] = 0x61; bytes[38] = 0x74; bytes[39] = 0x61;
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < sampleCount; i += 1) {
    const sample = samples[i];
    // Clamp to [-1, 1] before scaling, matching typical PCM encoders.
    const clamped = sample > 1 ? 1 : sample < -1 ? -1 : sample;
    const value = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    view.setInt16(44 + i * 2, value, true);
  }

  return bytes;
}

// ── Transcript assembly ───────────────────────────────────────────────────────

/**
 * Combine per-chunk transcripts into one coherent transcript, in order.
 * Empty chunks are dropped. Chunks are joined with a single space (Whisper
 * already separates its own segments with spaces, so a newline would show up
 * as mid-paragraph breaks in the existing single-paragraph transcript UI).
 */
export function mergeTranscriptChunks(chunks: string[]): string {
  return chunks
    .map((chunk) => (chunk ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ");
}

// ── Friendly byte formatting ──────────────────────────────────────────────────

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
