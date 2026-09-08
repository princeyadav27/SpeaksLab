// Server-side transcription backends for /api/transcribe.
//
// Two backends share one HTTP contract ({ transcript, model, source }):
//
// 1. Cloud / OpenAI-compatible Whisper API (e.g. Groq). Enabled by setting
//    WHISPER_API_URL. This is the zero-setup path that works on hosted
//    platforms such as Vercel, where local binaries are unavailable.
// 2. Local Whisper CLI (existing behavior). Used when WHISPER_API_URL is not
//    set and whisper + ffmpeg are installed on the server.
//
// This module intentionally imports no Next.js code so it can be unit-tested
// directly with mocked fetch.

import {
  MAX_UPLOAD_BYTES,
} from "./transcriptionShared";

export type TranscriptionSuccess = {
  ok: true;
  transcript: string;
  model: string;
  source: "api" | "local";
};

export type TranscriptionFailure = {
  ok: false;
  /** HTTP status the route should return. */
  status: number;
  /** User-facing error message. */
  error: string;
};

export type TranscriptionResult = TranscriptionSuccess | TranscriptionFailure;

/** The uploaded bytes are not decodable audio (a client-side file problem). */
export class AudioDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudioDecodeError";
  }
}

// ── Cloud (OpenAI-compatible) backend ─────────────────────────────────────────

export type ApiBackendConfig = {
  apiUrl: string;
  apiKey: string;
  model: string;
  language?: string;
  timeoutMs: number;
  /**
   * When true, an empty transcript (a silent segment inside a longer,
   * chunked recording) is a valid empty result instead of an error.
   * Whole-recording silence should still surface as a no-speech error.
   */
  allowEmpty?: boolean;
};

export type ApiBackendFile = {
  buffer: ArrayBuffer;
  mimeType: string;
  name: string;
};

/**
 * Transcribe through an OpenAI-compatible /audio/transcriptions endpoint.
 * Returns a typed result; never throws for provider-level failures.
 */
export async function transcribeWithApi(
  file: ApiBackendFile,
  config: ApiBackendConfig,
): Promise<TranscriptionResult> {
  const { apiUrl, apiKey, model, language, timeoutMs } = config;
  const endpoint = apiUrl.trim().replace(/\/+$/, "");

  const form = new FormData();
  const blobType = file.mimeType || "application/octet-stream";
  // Node 18+ global FormData + Blob.
  form.append("file", new Blob([file.buffer], { type: blobType }), file.name);
  form.append("model", model);
  form.append("response_format", "json");
  if (language) form.append("language", language);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      return {
        ok: false,
        status: 504,
        error: "The transcription request timed out. Please try again.",
      };
    }
    const detail = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      status: 502,
      error: `Could not reach the transcription service. ${detail}`,
    };
  }

  const rawBody = await response.text().catch(() => "");
  let providerMessage = "";
  try {
    const parsed = JSON.parse(rawBody) as { error?: { message?: string } };
    providerMessage = parsed.error?.message ?? "";
  } catch {
    // Body may not be JSON (proxy HTML etc.); ignore.
  }

  if (!response.ok) {
    const suffix = providerMessage ? ` ${providerMessage}` : "";
    const base = `Transcription failed (HTTP ${response.status}).`;
    switch (response.status) {
      case 400:
        return {
          ok: false,
          status: 400,
          error: `The recording could not be transcribed — the provider rejected the audio file.${suffix} If this is a video, try re-recording it.`,
        };
      case 401:
      case 403:
        return {
          ok: false,
          status: 502,
          error: `Transcription is unavailable: the API key is missing or invalid.${suffix}`,
        };
      case 413:
        return {
          ok: false,
          status: 413,
          error: `The recording is too large for the transcription provider (limit ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB). Try a shorter recording.`,
        };
      case 429:
        return {
          ok: false,
          status: 429,
          error: `The transcription service is busy (rate limit reached). Please wait a minute and try again.${suffix}`,
        };
      case 500:
      case 502:
      case 503:
      case 504:
        return {
          ok: false,
          status: 502,
          error: `The transcription service is temporarily unavailable.${suffix}`,
        };
      default:
        return { ok: false, status: 502, error: `${base}${suffix}` };
    }
  }

  let text = "";
  try {
    const parsed = JSON.parse(rawBody) as { text?: string };
    text = parsed.text ?? "";
  } catch {
    // A non-JSON 2xx body should not happen; treat as empty.
  }

  text = text.replace(/\s+/g, " ").trim();
  if (!text) {
    if (config.allowEmpty) {
      return { ok: true, transcript: "", model, source: "api" };
    }
    return {
      ok: false,
      status: 200,
      error: "No speech was detected in the recording.",
    };
  }

  return { ok: true, transcript: text, model, source: "api" };
}

// ── Local Whisper CLI backend (existing behavior) ─────────────────────────────

/**
 * Run free local Whisper on the server. Browser media is converted to a
 * normalized 16 kHz mono WAV first so the model receives consistent input.
 *
 * When the upload is already a normalized WAV (the client's long-recording
 * pipeline sends one), the ffmpeg decode step is skipped entirely.
 */
export async function transcribeWithLocalWhisper(
  buffer: Buffer,
  mimeType: string,
  originalName: string,
  allowEmpty = false,
): Promise<TranscriptionResult> {
  const whisperBinary = process.env.WHISPER_BINARY ?? "whisper";
  const whisperModel = process.env.WHISPER_MODEL ?? "small.en";
  const language = process.env.WHISPER_LANGUAGE ?? "en";

  const { execFile, spawn } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);
  const { mkdtemp, writeFile, readFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");

  const tempDir = await mkdtemp(path.join(tmpdir(), "speaklab-whisper-"));
  const lowerName = originalName.toLowerCase();
  const isWav = /\.wav$/i.test(lowerName) || mimeType.includes("wav");
  const inputExtension = isWav
    ? "wav"
    : mimeType.includes("ogg") || lowerName.endsWith(".ogg")
      ? "ogg"
      : mimeType.includes("mp4") || mimeType.includes("quicktime") || lowerName.endsWith(".mp4") || lowerName.endsWith(".mov")
        ? "mp4"
        : "webm";
  const inputPath = path.join(tempDir, `input.${inputExtension}`);
  const wavPath = path.join(tempDir, "normalized.wav");
  const outputPath = path.join(tempDir, "normalized.txt");

  try {
    await writeFile(inputPath, buffer);

    if (!isWav) {
      try {
        await execFileAsync("ffmpeg", [
          "-y", "-i", inputPath, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wavPath,
        ], { timeout: 60_000, maxBuffer: 2 * 1024 * 1024 });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        if (/ENOENT|not found|No such file/i.test(detail)) {
          // FFmpeg itself is missing - a server dependency problem.
          throw new Error(`FFmpeg is not installed or not on PATH. ${detail}`);
        }
        throw new AudioDecodeError(`FFmpeg could not decode the recording: ${detail}`);
      }
    }

    await new Promise<void>((resolve, reject) => {
      const child = spawn(/* turbopackIgnore: true */ whisperBinary, [
        isWav ? inputPath : wavPath,
        "--model", whisperModel,
        "--output_format", "txt",
        "--output_dir", tempDir,
        "--language", language,
        "--task", "transcribe",
        "--temperature", "0",
        "--beam_size", "5",
        "--condition_on_previous_text", "True",
        "--fp16", "False",
      ], { stdio: ["ignore", "pipe", "pipe"] });
      let stderr = "";
      child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error("Whisper timed out. Try a smaller WHISPER_MODEL such as small.en."));
      }, 5 * 60 * 1000);
      child.on("error", (error) => { clearTimeout(timer); reject(new Error(`Whisper is unavailable: ${error.message}`)); });
      child.on("exit", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`Whisper exited with code ${String(code)}${stderr ? `: ${stderr.slice(-400)}` : ""}`));
      });
    });

    const transcript = (await readFile(outputPath, "utf8")).replace(/\s+/g, " ").trim();
    if (!transcript) {
      if (allowEmpty) return { ok: true, transcript: "", model: whisperModel, source: "local" };
      throw new Error("No speech was detected in the recording.");
    }
    return { ok: true, transcript, model: whisperModel, source: "local" };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

// ── Backend selection ─────────────────────────────────────────────────────────

export type BackendSelection =
  | { kind: "api"; config: ApiBackendConfig }
  | { kind: "local" };

/**
 * Decide which backend to use from server environment variables.
 * WHISPER_API_URL turns on the hosted API backend; otherwise the local
 * Whisper CLI is used (when installed).
 */
export function selectBackend(
  env: Record<string, string | undefined> = process.env,
): BackendSelection {
  const apiUrl = env.WHISPER_API_URL?.trim();
  if (apiUrl) {
    return {
      kind: "api",
      config: {
        apiUrl,
        apiKey: env.WHISPER_API_KEY ?? "",
        model: env.WHISPER_MODEL?.trim() || "whisper-large-v3-turbo",
        language: env.WHISPER_LANGUAGE?.trim() || "en",
        timeoutMs: 5 * 60 * 1000,
      },
    };
  }
  return { kind: "local" };
}
