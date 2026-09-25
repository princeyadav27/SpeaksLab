import { describe, expect, it } from "vitest";
import {
  assertOwnedRecordingPath,
  mediaPathFor,
  metadataPathFor,
  newRecordingId,
  parseRecordingMetadata,
  recordingsPrefixFor,
  safeExtensionForContentType,
  sanitizeRecordingId,
} from "../lib/recordingPaths";

const USER = "user_2abcDEF123";

function validMetadata(overrides: Record<string, unknown> = {}) {
  return {
    id: "1737000000000-abc123",
    topicId: "topic-1",
    topicName: "Describe a time you taught someone something",
    categoryId: "ai-engineering",
    categoryName: "AI Engineering",
    difficulty: "medium",
    prepMinutes: 3,
    durationSeconds: 95,
    createdAt: new Date(0).toISOString(),
    storage: "cloud",
    mediaUrl: "https://store.public.blob.vercel-storage.com/recordings/user_2abcDEF123/1737000000000-abc123.x7f.webm",
    mediaPathname: "recordings/user_2abcDEF123/1737000000000-abc123.x7f.webm",
    ...overrides,
  };
}

describe("recording id + paths", () => {
  it("generates ids that pass their own sanitization", () => {
    for (let index = 0; index < 50; index += 1) {
      expect(sanitizeRecordingId(newRecordingId())).toBeTypeOf("string");
    }
  });

  it("rejects unsafe recording ids", () => {
    expect(() => sanitizeRecordingId("../escape")).toThrow();
    expect(() => sanitizeRecordingId("")).toThrow();
    expect(() => sanitizeRecordingId("a".repeat(81))).toThrow();
    expect(() => sanitizeRecordingId("has space")).toThrow();
    expect(() => sanitizeRecordingId("ok_id-1")).not.toThrow();
  });

  it("builds metadata and media paths under the user folder", () => {
    expect(metadataPathFor(USER, "rec-1")).toBe("recordings/user_2abcDEF123/rec-1.json");
    expect(mediaPathFor(USER, "rec-1", "webm")).toBe("recordings/user_2abcDEF123/rec-1.webm");
    expect(recordingsPrefixFor(USER)).toBe("recordings/user_2abcDEF123/");
  });

  it("rejects user ids or ids that are not app-shaped", () => {
    expect(() => metadataPathFor("../evil", "rec-1")).toThrow();
    expect(() => mediaPathFor(USER, "rec-1", "webm;format=2")).toThrow();
    expect(() => mediaPathFor(USER, "rec-1", "we/bm")).toThrow();
    expect(() => mediaPathFor(USER, "rec-1", "")).toThrow();
  });
});

describe("assertOwnedRecordingPath", () => {
  it("accepts paths inside the user's own folder", () => {
    expect(() =>
      assertOwnedRecordingPath(USER, "recordings/user_2abcDEF123/rec-1.random.webm"),
    ).not.toThrow();
    expect(() =>
      assertOwnedRecordingPath(USER, "recordings/user_2abcDEF123/rec-1.json"),
    ).not.toThrow();
  });

  it("rejects other users' folders, traversal, and nested paths", () => {
    expect(() =>
      assertOwnedRecordingPath(USER, "recordings/user_OTHER/rec-1.webm"),
    ).toThrow();
    expect(() =>
      assertOwnedRecordingPath(USER, "recordings/user_2abcDEF123/../user_OTHER/rec-1.webm"),
    ).toThrow();
    expect(() =>
      assertOwnedRecordingPath(USER, "recordings/user_2abcDEF123/nested/rec-1.webm"),
    ).toThrow();
    expect(() => assertOwnedRecordingPath(USER, "recordings/user_2abcDEF123/")).toThrow();
    expect(() => assertOwnedRecordingPath(USER, "system/build-cache.zip")).toThrow();
  });
});

describe("safeExtensionForContentType", () => {
  it("maps recorder mime types to safe extensions", () => {
    expect(safeExtensionForContentType("video/webm;codecs=vp9")).toBe("webm");
    expect(safeExtensionForContentType("video/mp4")).toBe("mp4");
    expect(safeExtensionForContentType("audio/webm;codecs=opus")).toBe("webm");
    expect(safeExtensionForContentType("audio/mp4")).toBe("mp4");
    expect(safeExtensionForContentType("video/x-matroska;codecs=avc1")).toBe("mkv");
    expect(safeExtensionForContentType("audio/mpeg")).toBe("mp3");
  });

  it("falls back to webm for unknown types", () => {
    expect(safeExtensionForContentType("application/octet-stream")).toBe("webm");
    expect(safeExtensionForContentType("")).toBe("webm");
  });
});

describe("parseRecordingMetadata", () => {
  const expected = { userId: USER, recordingId: "1737000000000-abc123" };

  it("accepts and normalizes a valid document", () => {
    const parsed = parseRecordingMetadata(validMetadata(), expected);
    expect(parsed.id).toBe("1737000000000-abc123");
    expect(parsed.durationSeconds).toBe(95);
    expect(parsed.storage).toBe("cloud");
  });

  it("rounds fractional durations", () => {
    const parsed = parseRecordingMetadata(validMetadata({ durationSeconds: 95.7 }), expected);
    expect(parsed.durationSeconds).toBe(96);
  });

  it("rejects documents whose id does not match the target", () => {
    expect(() =>
      parseRecordingMetadata(validMetadata({ id: "other-recording" }), expected),
    ).toThrow();
  });

  it("rejects media pointers outside the user's folder", () => {
    expect(() =>
      parseRecordingMetadata(
        validMetadata({
          mediaPathname: "recordings/user_OTHER/rec.webm",
          mediaUrl: "https://store.public.blob.vercel-storage.com/recordings/user_OTHER/rec.webm",
        }),
        expected,
      ),
    ).toThrow();
  });

  it("rejects non-https media urls", () => {
    expect(() =>
      parseRecordingMetadata(
        validMetadata({ mediaUrl: "http://store.public.blob.vercel-storage.com/x.webm" }),
        expected,
      ),
    ).toThrow();
  });

  it("keeps optional fields and drops unknown garbage safely", () => {
    const parsed = parseRecordingMetadata(
      validMetadata({
        transcript: "hello world",
        notes: "prep notes",
        metrics: { wordCount: 120 },
        evaluation: { overallScore: 8 },
        mediaSize: 12345,
        mediaContentType: "video/webm",
       evilExtra: "dropped",
      }),
      expected,
    );
    expect(parsed.transcript).toBe("hello world");
    expect(parsed.metrics).toEqual({ wordCount: 120 });
    expect(parsed.evaluation).toEqual({ overallScore: 8 });
    expect(parsed.mediaSize).toBe(12345);
    expect((parsed as unknown as Record<string, unknown>).evilExtra).toBeUndefined();
  });

  it("rejects broken required fields", () => {
    expect(() => parseRecordingMetadata(validMetadata({ topicName: "" }), expected)).toThrow();
    expect(() => parseRecordingMetadata(validMetadata({ durationSeconds: -5 }), expected)).toThrow();
    expect(() => parseRecordingMetadata(validMetadata({ createdAt: "not-a-date" }), expected)).toThrow();
    expect(() => parseRecordingMetadata(validMetadata({ metrics: "nope" }), expected)).toThrow();
    expect(() => parseRecordingMetadata("not an object", expected)).toThrow();
    expect(() => parseRecordingMetadata(null, expected)).toThrow();
  });
});
