import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const TRANSCRIPTION_TIMEOUT_MS = 5 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No audio/video file was provided." }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "The uploaded file is empty." }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "The recording is larger than 25 MB." }, { status: 413 });
    }

    const transcript = await transcribeWithLocalWhisper(
      Buffer.from(await file.arrayBuffer()),
      file.type,
      file.name,
    );

    return NextResponse.json({ transcript, model: process.env.WHISPER_MODEL ?? "small.en" });
  } catch (error) {
    console.error("Transcription error:", error);
    const message = error instanceof Error ? error.message : "Unknown transcription error.";
    return NextResponse.json(
      { error: `Transcription failed. Install Whisper and FFmpeg, then try again. ${message}` },
      { status: 500 },
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
      throw new Error(`FFmpeg could not decode the recording: ${error instanceof Error ? error.message : String(error)}`);
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
