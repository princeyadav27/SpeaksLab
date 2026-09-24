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
  /** Planning notes the learner typed during the prep timer, if any. */
  notes?: string;
  durationSeconds: number;
  createdAt: string;
  /** Loaded lazily from IndexedDB when a recording is selected. */
  blob: Blob;
  transcript?: string;
  metrics?: SpeakingMetrics;
  evaluation?: AIEvaluation;
};

const DB_NAME = "speaklab-recordings";
const STORE_NAME = "recordings";
const DB_VERSION = 2;
const BLOB_STORE_NAME = "recording-blobs";
let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
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
      if (!database.objectStoreNames.contains(BLOB_STORE_NAME)) {
        database.createObjectStore(BLOB_STORE_NAME, { keyPath: "id" });
      }

      // Move existing media out of the listing store. Future library loads
      // can then read lightweight metadata without loading every video blob.
      if (request.transaction && request.transaction.db.version === 2) {
        const records = request.transaction.objectStore(STORE_NAME);
        const blobs = request.transaction.objectStore(BLOB_STORE_NAME);
        records.openCursor().onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result as IDBCursorWithValue | null;
          if (!cursor) return;
          const value = cursor.value as SavedRecording;
          if (value.blob) {
            blobs.put({ id: value.id, blob: value.blob });
            const metadata = { ...value } as Partial<SavedRecording> & { id: string };
            delete metadata.blob;
            cursor.update(metadata);
          }
          cursor.continue();
        };
      }
    };

    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      database.onclose = () => {
        databasePromise = null;
      };
      resolve(database);
    };

    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error("Failed to open IndexedDB."));
    };
  });
  return databasePromise;
}

export async function saveRecording(recording: SavedRecording): Promise<void> {
  const database = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME, BLOB_STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const blobs = transaction.objectStore(BLOB_STORE_NAME);
    const metadata = { ...recording } as Partial<SavedRecording> & { id: string };
    delete metadata.blob;
    store.put(metadata);
    if (recording.blob) blobs.put({ id: recording.id, blob: recording.blob });

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Failed to save recording."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Saving recording was aborted."));
  });

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
    const transaction = database.transaction([STORE_NAME, BLOB_STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const blobs = transaction.objectStore(BLOB_STORE_NAME);
    store.delete(id);
    blobs.delete(id);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Failed to delete recording."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Deleting recording was aborted."));
  });

}

export async function getRecordingBlob(id: string): Promise<Blob | undefined> {
  const database = await openDatabase();
  return new Promise<Blob | undefined>((resolve, reject) => {
    const request = database.transaction(BLOB_STORE_NAME, "readonly")
      .objectStore(BLOB_STORE_NAME)
      .get(id);
    request.onsuccess = () => resolve((request.result as { blob?: Blob } | undefined)?.blob);
    request.onerror = () => reject(request.error ?? new Error("Failed to load recording media."));
  });
}
