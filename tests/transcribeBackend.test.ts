import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import type { ChildProcess } from "node:child_process";
import {
  selectBackend,
  transcribeWithApi,
  transcribeWithLocalWhisper,
  type ApiBackendFile,
} from "../lib/transcribeBackend";

let mockSpawnArgs: { cmd: string; args: string[] } | null = null;
let mockSpawnExitCode = 0;
let mockSpawnError: Error | null = null;
let mockTxtContent = "Transcribed from local wav.";

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    spawn: (cmd: string, args: string[]) => {
      mockSpawnArgs = { cmd, args };
      const emitter = new EventEmitter() as ChildProcess;
      emitter.stderr = new EventEmitter() as unknown as ChildProcess["stderr"];

      if (mockSpawnError) {
        setTimeout(() => emitter.emit("error", mockSpawnError), 5);
        return emitter;
      }

      const outputDirIdx = args.indexOf("--output_dir");
      const tempDir = args[outputDirIdx + 1];
      if (tempDir) {
        void fs.writeFile(`${tempDir}/normalized.txt`, mockTxtContent);
      }

      setTimeout(() => {
        emitter.emit("exit", mockSpawnExitCode);
      }, 5);

      return emitter;
    },
  };
});

function exactArrayBuffer(text: string): ArrayBuffer {
  const encoded = new TextEncoder().encode(text);
  const copy = new Uint8Array(encoded.byteLength);
  copy.set(encoded);
  return copy.buffer; // exact-size ArrayBuffer, not a shared-pool view
}

const DEFAULT_FILE: ApiBackendFile = {
  buffer: exactArrayBuffer("fake-audio-bytes"),
  mimeType: "audio/wav",
  name: "audio-part-1.wav",
};

const DEFAULT_CONFIG = {
  apiUrl: "https://api.groq.com/openai/v1/audio/transcriptions",
  apiKey: "test-key",
  model: "whisper-large-v3-turbo",
  language: "en",
  timeoutMs: 300_000,
};

function mockFetchResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  mockSpawnArgs = null;
  mockSpawnExitCode = 0;
  mockSpawnError = null;
  mockTxtContent = "Transcribed from local wav.";
});

describe("selectBackend", () => {
  it("selects the local Whisper CLI when no API URL is configured", () => {
    expect(selectBackend({})).toEqual({ kind: "local" });
  });

  it("selects the hosted API when WHISPER_API_URL is set", () => {
    const selection = selectBackend({
      WHISPER_API_URL: "https://api.groq.com/openai/v1/audio/transcriptions",
      WHISPER_API_KEY: "key-123",
    });
    expect(selection).toEqual({
      kind: "api",
      config: {
        apiUrl: "https://api.groq.com/openai/v1/audio/transcriptions",
        apiKey: "key-123",
        model: "whisper-large-v3-turbo",
        language: "en",
        timeoutMs: 300_000,
      },
    });
  });

  it("honors WHISPER_MODEL, WHISPER_LANGUAGE, and WHISPER_TIMEOUT_MS overrides", () => {
    const selection = selectBackend({
      WHISPER_API_URL: "https://example.com/v1/audio/transcriptions",
      WHISPER_API_KEY: "k",
      WHISPER_MODEL: "whisper-large-v3",
      WHISPER_LANGUAGE: "hi",
      WHISPER_TIMEOUT_MS: "60000",
    });
    expect(selection.kind).toBe("api");
    if (selection.kind === "api") {
      expect(selection.config.model).toBe("whisper-large-v3");
      expect(selection.config.language).toBe("hi");
      expect(selection.config.timeoutMs).toBe(60000);
    }
  });
});

describe("transcribeWithApi", () => {
  it("posts the file to the endpoint and returns the trimmed transcript", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFetchResponse(200, { text: "  hello\n world.  " }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await transcribeWithApi(DEFAULT_FILE, DEFAULT_CONFIG);

    expect(result).toEqual({
      ok: true,
      transcript: "hello world.",
      model: "whisper-large-v3-turbo",
      source: "api",
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");

    const form = init.body as FormData;
    expect(form.get("model")).toBe("whisper-large-v3-turbo");
    expect(form.get("response_format")).toBe("json");
    expect(form.get("language")).toBe("en");
    const file = form.get("file") as Blob;
    expect(file.type).toBe("audio/wav");
    expect(await file.text()).toBe("fake-audio-bytes");
  });

  it("handles short audio files cleanly", async () => {
    const shortFile: ApiBackendFile = {
      buffer: exactArrayBuffer("short-wav-bytes"),
      mimeType: "audio/wav",
      name: "recording.wav",
    };
    const fetchMock = vi.fn().mockResolvedValue(mockFetchResponse(200, { text: "Short test transcript." }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await transcribeWithApi(shortFile, DEFAULT_CONFIG);
    expect(result).toEqual({
      ok: true,
      transcript: "Short test transcript.",
      model: "whisper-large-v3-turbo",
      source: "api",
    });
  });

  it("reports empty transcripts as no-speech failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockFetchResponse(200, { text: "   " })));
    const result = await transcribeWithApi(DEFAULT_FILE, DEFAULT_CONFIG);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(500);
      expect(result.error).toContain("No speech was detected");
    }
  });

  it("allows empty transcripts for silent segments inside chunked recordings", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockFetchResponse(200, { text: "   " })));
    const result = await transcribeWithApi(DEFAULT_FILE, { ...DEFAULT_CONFIG, allowEmpty: true });
    expect(result).toEqual({ ok: true, transcript: "", model: "whisper-large-v3-turbo", source: "api" });
  });

  it("treats non-JSON 2xx bodies as no-speech failures rather than crashing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockFetchResponse(200, "<html>proxy</html>")));
    const result = await transcribeWithApi(DEFAULT_FILE, DEFAULT_CONFIG);
    expect(result.ok).toBe(false);
  });

  it.each([
    [400, "rejected the audio", 400],
    [401, "api key", 502],
    [403, "api key", 502],
    [413, "too large", 413],
    [429, "rate limit", 429],
    [500, "temporarily unavailable", 502],
    [503, "temporarily unavailable", 502],
    [504, "temporarily unavailable", 502],
  ])("maps HTTP %s to a useful error message", async (status, expectedPhrase, expectedStatus) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockFetchResponse(status, { error: { message: "provider detail" } })));
    const result = await transcribeWithApi(DEFAULT_FILE, DEFAULT_CONFIG);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(expectedStatus);
      expect(result.error.toLowerCase()).toContain(expectedPhrase);
    }
  });

  it("keeps provider detail text in error messages", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockFetchResponse(429, { error: { message: "quota exceeded for the hour" } })));
    const result = await transcribeWithApi(DEFAULT_FILE, DEFAULT_CONFIG);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("quota exceeded for the hour");
    }
  });

  it("maps fetch timeouts to a 504 with a retry hint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("The operation timed out", "TimeoutError")),
    );
    const result = await transcribeWithApi(DEFAULT_FILE, DEFAULT_CONFIG);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(504);
      expect(result.error).toContain("timed out");
    }
  });

  it("maps network failures to a 502 reachability error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const result = await transcribeWithApi(DEFAULT_FILE, DEFAULT_CONFIG);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(502);
      expect(result.error).toContain("Could not reach");
    }
  });

  it("strips a trailing slash from the endpoint URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFetchResponse(200, { text: "ok" }));
    vi.stubGlobal("fetch", fetchMock);
    await transcribeWithApi(DEFAULT_FILE, { ...DEFAULT_CONFIG, apiUrl: "https://api.example.com/v1/audio/transcriptions/" });
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe("https://api.example.com/v1/audio/transcriptions");
  });
});

describe("transcribeWithLocalWhisper", () => {
  it("passes normalized.wav to whisper CLI when input is already a WAV file (fixing output filename mismatch)", async () => {
    const wavBuffer = Buffer.from("RIFF....WAVEfmt ");
    const result = await transcribeWithLocalWhisper(wavBuffer, "audio/wav", "audio-part-1.wav");

    expect(result).toEqual({
      ok: true,
      transcript: "Transcribed from local wav.",
      model: "small.en",
      source: "local",
    });

    expect(mockSpawnArgs).not.toBeNull();
    const inputArg = mockSpawnArgs!.args[0];
    expect(inputArg).toMatch(/normalized\.wav$/);
  });

  it("allows empty transcripts for silent segments when allowEmpty is true", async () => {
    mockTxtContent = "   ";
    const wavBuffer = Buffer.from("RIFF....WAVEfmt ");
    const result = await transcribeWithLocalWhisper(wavBuffer, "audio/wav", "audio-part-1.wav", true);
    expect(result).toEqual({
      ok: true,
      transcript: "",
      model: "small.en",
      source: "local",
    });
  });

  it("throws error for silent segments when allowEmpty is false", async () => {
    mockTxtContent = "   ";
    const wavBuffer = Buffer.from("RIFF....WAVEfmt ");
    await expect(
      transcribeWithLocalWhisper(wavBuffer, "audio/wav", "audio-part-1.wav", false),
    ).rejects.toThrow("No speech was detected in the recording.");
  });

  it("reports error when whisper exits with non-zero code", async () => {
    mockSpawnExitCode = 1;
    const wavBuffer = Buffer.from("RIFF....WAVEfmt ");
    await expect(
      transcribeWithLocalWhisper(wavBuffer, "audio/wav", "audio-part-1.wav"),
    ).rejects.toThrow(/Whisper exited with code 1/);
  });
});
