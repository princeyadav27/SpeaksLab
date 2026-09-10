import { describe, expect, it } from "vitest";
import {
  DIRECT_UPLOAD_BYTES,
  MAX_CHUNK_SECONDS,
  MAX_UPLOAD_BYTES,
  TARGET_CHANNELS,
  TARGET_SAMPLE_RATE,
  mergeTranscriptChunks,
  planWavChunks,
  shouldUploadDirectly,
  wavBytesFromPcm16,
  wavSizeForSeconds,
} from "../lib/transcriptionShared";

describe("planWavChunks", () => {
  it("returns no segments for empty audio", () => {
    expect(planWavChunks(0)).toEqual([]);
    expect(planWavChunks(-5)).toEqual([]);
  });

  it("handles short recordings in a single chunk", () => {
    const segments10s = planWavChunks(10);
    expect(segments10s).toHaveLength(1);
    expect(segments10s[0]).toEqual({ start: 0, seconds: 10 });

    const segments30s = planWavChunks(30);
    expect(segments30s).toHaveLength(1);
    expect(segments30s[0]).toEqual({ start: 0, seconds: 30 });

    const segments60s = planWavChunks(60);
    expect(segments60s).toHaveLength(1);
    expect(segments60s[0]).toEqual({ start: 0, seconds: 60 });
  });

  it("keeps a recording up to MAX_CHUNK_SECONDS in one chunk", () => {
    expect(planWavChunks(MAX_CHUNK_SECONDS)).toEqual([
      { start: 0, seconds: MAX_CHUNK_SECONDS },
    ]);
  });

  it("splits a 3-minute recording into bounded chunks", () => {
    const totalSeconds = 3 * 60; // 180s
    const segments = planWavChunks(totalSeconds);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toEqual({ start: 0, seconds: 90 });
    expect(segments[1]).toEqual({ start: 90, seconds: 90 });
  });

  it("splits a 4-minute recording into bounded chunks", () => {
    const totalSeconds = 4 * 60; // 240s
    const segments = planWavChunks(totalSeconds);
    expect(segments).toHaveLength(3);
    expect(segments[0]).toEqual({ start: 0, seconds: 90 });
    expect(segments[1]).toEqual({ start: 90, seconds: 90 });
    expect(segments[2]).toEqual({ start: 180, seconds: 60 });
  });

  it("splits a 5-minute recording into bounded chunks", () => {
    const totalSeconds = 5 * 60; // 300s
    const segments = planWavChunks(totalSeconds);
    expect(segments).toHaveLength(4);
    expect(segments[0]).toEqual({ start: 0, seconds: 90 });
    expect(segments[1]).toEqual({ start: 90, seconds: 90 });
    expect(segments[2]).toEqual({ start: 180, seconds: 90 });
    expect(segments[3]).toEqual({ start: 270, seconds: 30 });
  });

  it("splits a 10-minute recording into bounded chunks", () => {
    const totalSeconds = 10 * 60; // 600s
    const segments = planWavChunks(totalSeconds);
    expect(segments).toHaveLength(7); // 6 x 90s + 1 x 60s
    expect(segments[0]).toEqual({ start: 0, seconds: 90 });
    expect(segments[6]).toEqual({ start: 540, seconds: 60 });
  });

  it("splits a 15-minute recording into bounded chunks", () => {
    const totalSeconds = 15 * 60; // 900s
    const segments = planWavChunks(totalSeconds);
    expect(segments).toHaveLength(10);
    expect(segments[9]).toEqual({ start: 810, seconds: 90 });
  });

  it("tiles the full duration with no gaps, no overlap, in order", () => {
    for (const totalSeconds of [10, 45, 90, 91, 180, 240, 300, 600, 720, 1500, 3600, 7200]) {
      const segments = planWavChunks(totalSeconds);
      let cursor = 0;
      for (const segment of segments) {
        expect(segment.start).toBe(cursor);
        expect(segment.seconds).toBeGreaterThan(0);
        expect(segment.seconds).toBeLessThanOrEqual(MAX_CHUNK_SECONDS);
        cursor += segment.seconds;
      }
      expect(cursor).toBe(totalSeconds);
    }
  });

  it("every chunk fits safely below the deployment HTTP body limit (4.5 MB) and provider cap (25 MB)", () => {
    const totalSeconds = 3600;
    const serverlessBodyLimit = 4.5 * 1024 * 1024;
    for (const segment of planWavChunks(totalSeconds)) {
      const estimatedBytes = wavSizeForSeconds(segment.seconds);
      expect(estimatedBytes).toBeLessThan(serverlessBodyLimit);
      expect(estimatedBytes).toBeLessThan(MAX_UPLOAD_BYTES);
    }
  });
});

describe("wavSizeForSeconds / shouldUploadDirectly", () => {
  it("estimates 16 kHz mono 16-bit WAV size (44-byte header)", () => {
    expect(wavSizeForSeconds(0)).toBe(44);
    expect(wavSizeForSeconds(1)).toBe(44 + TARGET_SAMPLE_RATE * TARGET_CHANNELS * 2);
    expect(wavSizeForSeconds(60)).toBe(44 + 60 * 32000);
    // A single chunk is safely under 4.5 MB and 25 MB
    expect(wavSizeForSeconds(MAX_CHUNK_SECONDS)).toBeLessThan(4.5 * 1024 * 1024);
    expect(wavSizeForSeconds(MAX_CHUNK_SECONDS)).toBeLessThan(MAX_UPLOAD_BYTES);
  });

  it("uploads directly at or below the direct threshold", () => {
    expect(shouldUploadDirectly(1024)).toBe(true);
    expect(shouldUploadDirectly(1024 * 1024)).toBe(true);
    expect(shouldUploadDirectly(DIRECT_UPLOAD_BYTES)).toBe(true);
    expect(shouldUploadDirectly(DIRECT_UPLOAD_BYTES + 1)).toBe(false);
    expect(shouldUploadDirectly(0)).toBe(false);
    expect(shouldUploadDirectly(-1)).toBe(false);
  });

  it("correctly routes >24 MB recordings to the chunked workflow instead of direct upload", () => {
    const large25MB = 25 * 1024 * 1024;
    const large50MB = 50 * 1024 * 1024;
    const large100MB = 100 * 1024 * 1024;
    expect(shouldUploadDirectly(large25MB)).toBe(false);
    expect(shouldUploadDirectly(large50MB)).toBe(false);
    expect(shouldUploadDirectly(large100MB)).toBe(false);
  });
});

describe("wavBytesFromPcm16", () => {
  it("writes a valid RIFF/WAVE header with 16 kHz mono 16-bit PCM", () => {
    const bytes = wavBytesFromPcm16(new Float32Array(10));
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("RIFF");
    expect(view.getUint32(4, true)).toBe(36 + 10 * 2);
    expect(String.fromCharCode(...bytes.slice(8, 12))).toBe("WAVE");
    expect(String.fromCharCode(...bytes.slice(12, 16))).toBe("fmt ");
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint16(34, true)).toBe(16); // bits per sample
    expect(String.fromCharCode(...bytes.slice(36, 40))).toBe("data");
    expect(view.getUint32(40, true)).toBe(10 * 2);
    expect(bytes.byteLength).toBe(44 + 10 * 2);
  });

  it("clamps samples to the int16 range and encodes 0 as silence", () => {
    const bytes = wavBytesFromPcm16(new Float32Array([0, 2, -2, 0.5, -0.5]));
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(32767);
    expect(view.getInt16(48, true)).toBe(-32768);
    // 0.5 * 32767 = 16383.5 (truncated toward zero by setInt16 semantics).
    expect(Math.abs(view.getInt16(50, true) - 16383.5)).toBeLessThan(1);
    expect(Math.abs(view.getInt16(52, true) + 16383.5)).toBeLessThan(1);
  });

  it("round-trips a small sine through the header byte length", () => {
    const samples = new Float32Array(16000);
    for (let i = 0; i < samples.length; i += 1) {
      samples[i] = Math.sin((2 * Math.PI * 440 * i) / 16000) * 0.5;
    }
    const bytes = wavBytesFromPcm16(samples);
    expect(bytes.byteLength).toBe(44 + 16000 * 2);
  });
});

describe("mergeTranscriptChunks", () => {
  it("joins ordered non-empty chunks with a single space", () => {
    expect(
      mergeTranscriptChunks(["Hello world.", "This is part two."]),
    ).toBe("Hello world. This is part two.");
  });

  it("preserves ordering of multiple sequential chunks for long recordings", () => {
    const multiChunks = [
      "Welcome to the session.",
      "In this section we discuss architecture.",
      "Here are three key considerations.",
      "Finally we summarize our findings.",
    ];
    expect(mergeTranscriptChunks(multiChunks)).toBe(
      "Welcome to the session. In this section we discuss architecture. Here are three key considerations. Finally we summarize our findings.",
    );
  });

  it("normalizes whitespace within chunks", () => {
    expect(mergeTranscriptChunks(["Hello \n  world.   ", "\tSecond.  "])).toBe(
      "Hello world. Second.",
    );
  });

  it("drops empty chunks and returns empty string when all are empty", () => {
    expect(mergeTranscriptChunks(["", "  ", null as unknown as string, "Real text"])).toBe("Real text");
    expect(mergeTranscriptChunks([])).toBe("");
    expect(mergeTranscriptChunks(["", "   "])).toBe("");
  });
});
