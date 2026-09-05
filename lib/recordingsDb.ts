import type { SpeakingMetrics } from "./speakingMetrics";
import type { AIEvaluation } from "./aiEvaluation";

export type SavedRecording = {
  id: string;
  topicId: string;
  topicName: string;
  challengeQuestion?: string;
  categoryId: string;
  categoryName: string;
  difficulty: string;
  prepMinutes: number;
  durationSeconds: number;
  createdAt: string;
  blob: Blob;
  transcript?: string;
  metrics?: SpeakingMetrics;
  evaluation?: AIEvaluation;
};

const DB_NAME = "speaklab-recordings";
const STORE_NAME = "recordings";
const DB_VERSION = 1;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      reject(new Error("IndexedDB is not supported in this browser."));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error ?? new Error("Failed to open IndexedDB."));
    };
  });
}

export async function saveRecording(recording: SavedRecording): Promise<void> {
  const database = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(recording);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Failed to save recording."));
  });

  database.close();
}

export async function getRecordings(): Promise<SavedRecording[]> {
  const database = await openDatabase();

  const recordings = await new Promise<SavedRecording[]>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      resolve((request.result ?? []) as SavedRecording[]);
    };

    request.onerror = () => reject(request.error ?? new Error("Failed to load recordings."));
  });

  database.close();
  return recordings.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export async function deleteRecording(id: string): Promise<void> {
  const database = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Failed to delete recording."));
  });

  database.close();
}