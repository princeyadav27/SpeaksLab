import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const TRANSCRIPTION_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * The uploaded bytes are not decodable audio. That is the client's file, not a
 * missing server dependency, so it must not be reported as "install Whisper".
 */
class AudioDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudioDecodeError";
  }
}

export async function POST(request: Request) {
  // Parse the multipart body separately: a malformed request is a client
  // error (400), not a missing-dependency server error (500).
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (error) {
    return NextResponse.json(
      {
        error: `Expected a multipart/form-data upload with a "file" field. ${
          error instanceof Error ? error.message : ""
        }`.trim(),
      },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: 'No audio/video file was provided. Send it as a "file" field.' },
      { status: 400 },
    );
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "The uploaded file is empty." }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "The recording is larger than 25 MB." }, { status: 413 });
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await file.arrayBuffer());
  } catch (error) {
    return NextResponse.json(
      { error: `The upload could not be read. ${error instanceof Error ? error.message : ""}`.trim() },
      { status: 400 },
    );
  }

  try {
    const transcript = await transcribeWithLocalWhisper(buffer, file.type, file.name);
    return NextResponse.json({
      transcript,
      model: process.env.WHISPER_MODEL ?? "small.en",
    });
  } catch (error) {
    console.error("Transcription error:", error);
    const message = error instanceof Error ? error.message : "Unknown transcription error.";

    // A corrupt upload is a client error, not a toolchain problem.
    if (error instanceof AudioDecodeError) {
      return NextResponse.json(
        { error: `The recording could not be decoded as audio. Try re-recording. ${message}` },
        { status: 400 },
      );
    }

    // Only claim a missing toolchain when that is actually what happened;
    // otherwise surface the real reason.
    const missingTool = /ENOENT|Whisper is unavailable|not on PATH/.test(message);
    const status = missingTool ? 503 : 500;
    return NextResponse.json(
      {
        error: missingTool
          ? `Transcription is unavailable on this server. Install Whisper and FFmpeg, then try again. ${message}`
          : `Transcription failed. ${message}`,
      },
      { status },
    );
  }
}

/**
 * Whisper is free and runs on the server. Convert browser media to a
 * normalized WAV first so the Whisper model receives a consistent input.
 */
async function transcribeWithLocalWhisper(
  buffer: Buffer,
  mimeType: string,
  originalName: string,
): Promise<string> {
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
  const inputExtension = mimeType.includes("ogg") || lowerName.endsWith(".ogg")
    ? "ogg"
    : mimeType.includes("mp4") || mimeType.includes("quicktime") || lowerName.endsWith(".mp4") || lowerName.endsWith(".mov")
      ? "mp4"
      : "webm";
  const inputPath = path.join(tempDir, `input.${inputExtension}`);
  const wavPath = path.join(tempDir, "normalized.wav");
  const outputPath = path.join(tempDir, "normalized.txt");

  try {
    await writeFile(inputPath, buffer);
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

    await new Promise<void>((resolve, reject) => {
      const child = spawn(/* turbopackIgnore: true */ whisperBinary, [
        wavPath,
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
      }, TRANSCRIPTION_TIMEOUT_MS);
      child.on("error", (error) => { clearTimeout(timer); reject(new Error(`Whisper is unavailable: ${error.message}`)); });
      child.on("exit", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`Whisper exited with code ${String(code)}${stderr ? `: ${stderr.slice(-400)}` : ""}`));
      });
    });

    const transcript = (await readFile(outputPath, "utf8")).replace(/\s+/g, " ").trim();
    if (!transcript) throw new Error("No speech was detected in the recording.");
    return transcript;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
