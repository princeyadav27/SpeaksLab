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

  it("keeps a 10-minute recording in a single chunk", () => {
    const segments = planWavChunks(10 * 60);
    expect(segments).toHaveLength(1);
    expect(segments[0].start).toBe(0);
    expect(segments[0].seconds).toBe(600);
  });

  it("keeps a recording up to MAX_CHUNK_SECONDS in one chunk", () => {
    expect(planWavChunks(MAX_CHUNK_SECONDS)).toHaveLength(1);
  });

  it("splits a recording longer than MAX_CHUNK_SECONDS into bounded chunks", () => {
    const totalSeconds = MAX_CHUNK_SECONDS + 90;
    const segments = planWavChunks(totalSeconds);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toEqual({ start: 0, seconds: MAX_CHUNK_SECONDS });
    expect(segments[1]).toEqual({ start: MAX_CHUNK_SECONDS, seconds: 90 });
  });

  it("tiles the full duration with no gaps, no overlap, in order", () => {
    for (const totalSeconds of [720, 721, 1500, 3600, 7200]) {
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

  it("every chunk fits inside the provider byte limit", () => {
    const totalSeconds = 3600;
    for (const segment of planWavChunks(totalSeconds)) {
      expect(wavSizeForSeconds(segment.seconds)).toBeLessThan(MAX_UPLOAD_BYTES);
    }
  });
});

describe("wavSizeForSeconds / shouldUploadDirectly", () => {
  it("estimates 16 kHz mono 16-bit WAV size (44-byte header)", () => {
    expect(wavSizeForSeconds(1)).toBe(44 + TARGET_SAMPLE_RATE * TARGET_CHANNELS * 2);
    expect(wavSizeForSeconds(600)).toBe(44 + 600 * 32000);
    // A 12-minute chunk is under the upload cap.
    expect(wavSizeForSeconds(720)).toBeLessThan(MAX_UPLOAD_BYTES);
  });

  it("uploads directly at or below the direct threshold", () => {
    expect(shouldUploadDirectly(DIRECT_UPLOAD_BYTES)).toBe(true);
    expect(shouldUploadDirectly(DIRECT_UPLOAD_BYTES + 1)).toBe(false);
    expect(shouldUploadDirectly(0)).toBe(false);
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
