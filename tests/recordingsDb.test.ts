import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import type { SavedRecording } from "../lib/recordingsDb";

// These tests drive the real lib/recordingsDb.ts module against an in-memory
// IndexedDB. The module caches one shared connection at module scope, so each
// test gets a brand-new database AND a freshly imported module instance.

const DB_NAME = "speaklab-recordings";

async function loadDb() {
  return import("../lib/recordingsDb");
}

function makeRecording(id: string, content = `media-${id}`, extra: Partial<SavedRecording> = {}): SavedRecording {
  return {
    id,
    topicId: "topic-1",
    topicName: `Topic ${id}`,
    challengeQuestion: `Question ${id}?`,
    categoryId: "ai-engineering",
    categoryName: "AI Engineering",
    difficulty: "easy",
    prepMinutes: 1,
    durationSeconds: 42,
    createdAt: new Date(Date.UTC(2026, 8, 24, 12, 0, Number(id.replace(/\D/g, "") || 0))).toISOString(),
    blob: new Blob([content], { type: "video/webm" }),
    ...extra,
  };
}

/** Create the pre-PR #4 (version 1) schema, where each record embeds its blob. */
async function seedVersion1Database(records: SavedRecording[]) {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("recordings", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction("recordings", "readwrite");
    for (const record of records) transaction.objectStore("recordings").put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  // recordingsDb reads `window.indexedDB`, as it does in the browser.
  vi.stubGlobal("window", globalThis);
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("recordingsDb shared connection", () => {
  it("loads a recording's media after the library list has been read", async () => {
    // Regression: getRecordings() closed the shared connection, so the My
    // Recordings page showed "The recording media could not be loaded."
    const db = await loadDb();
    await db.saveRecording(makeRecording("rec-1", "video-bytes"));

    const listed = await db.getRecordings();
    expect(listed.map((item) => item.id)).toEqual(["rec-1"]);

    const blob = await db.getRecordingBlob("rec-1");
    expect(blob).toBeInstanceOf(Blob);
    expect(await blob?.text()).toBe("video-bytes");
  });

  it("can still save, update, and delete after the library list has been read", async () => {
    // Regression: after visiting My Recordings, a new Topic Challenge
    // recording failed with "There was a problem saving the recording locally".
    const db = await loadDb();
    await db.saveRecording(makeRecording("rec-1"));
    await db.getRecordings();

    await db.saveRecording(makeRecording("rec-2"));
    await db.saveRecording({ ...makeRecording("rec-1"), transcript: "hello world" });
    await db.deleteRecording("rec-2");

    const listed = await db.getRecordings();
    expect(listed.map((item) => item.id)).toEqual(["rec-1"]);
    expect(listed[0].transcript).toBe("hello world");
    expect(await db.getRecordingBlob("rec-2")).toBeUndefined();
  });

  it("serves the listing without media and keeps media in the blob store", async () => {
    const db = await loadDb();
    await db.saveRecording(makeRecording("rec-1", "abc"));

    const [listed] = await db.getRecordings();
    expect(listed.blob).toBeUndefined();
    expect(await (await db.getRecordingBlob("rec-1"))?.text()).toBe("abc");
  });

  it("does not drop the stored media when metadata is saved without a loaded blob", async () => {
    // The recordings page can save an evaluation before the media finished
    // loading; that must never erase the video.
    const db = await loadDb();
    await db.saveRecording(makeRecording("rec-1", "keep-me"));
    const [listed] = await db.getRecordings();

    await db.saveRecording({ ...listed, transcript: "updated" });

    expect(await (await db.getRecordingBlob("rec-1"))?.text()).toBe("keep-me");
    expect((await db.getRecordings())[0].transcript).toBe("updated");
  });

  it("reopens instead of failing after another tab deletes or upgrades the database", async () => {
    const db = await loadDb();
    await db.saveRecording(makeRecording("rec-1"));

    // Another tab deleting (or upgrading) the database sends `versionchange`
    // to this connection, which closes it so the other tab is not blocked.
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    await db.saveRecording(makeRecording("rec-2", "after-reopen"));
    expect((await db.getRecordings()).map((item) => item.id)).toEqual(["rec-2"]);
    expect(await (await db.getRecordingBlob("rec-2"))?.text()).toBe("after-reopen");
  });
});

describe("recordingsDb version 1 -> 2 upgrade", () => {
  it("keeps every existing recording and its media readable", async () => {
    await seedVersion1Database([
      makeRecording("old-1", "first-video", { transcript: "first transcript" }),
      makeRecording("old-2", "second-video"),
    ]);

    const db = await loadDb();
    const listed = await db.getRecordings();

    expect(listed.map((item) => item.id).sort()).toEqual(["old-1", "old-2"]);
    expect(listed.every((item) => item.blob === undefined)).toBe(true);
    expect(listed.find((item) => item.id === "old-1")?.transcript).toBe("first transcript");
    expect(await (await db.getRecordingBlob("old-1"))?.text()).toBe("first-video");
    expect(await (await db.getRecordingBlob("old-2"))?.text()).toBe("second-video");
  });
});
