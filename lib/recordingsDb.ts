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

// One connection is opened lazily and shared by every helper in this module.
// Helpers must NEVER call database.close() on it: a closed connection stays
// cached, and every later call then fails with "InvalidStateError: The
// database connection is closing" (this broke media loading, saving, and
// deleting on the My Recordings page). The cache is cleared automatically
// whenever the connection really goes away.
let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
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
      // Another tab is deleting or upgrading the database: step aside so it
      // is not blocked. An explicit close() does not fire the "close" event,
      // so the cached (now closed) connection must be forgotten here too.
      database.onversionchange = () => {
        if (databasePromise === opening) databasePromise = null;
        database.close();
      };
      // The browser closed the connection itself (e.g. site data cleared).
      database.onclose = () => {
        if (databasePromise === opening) databasePromise = null;
      };
      resolve(database);
    };

    request.onerror = () => {
      reject(request.error ?? new Error("Failed to open IndexedDB."));
    };
  });
  databasePromise = opening;
  // Never cache a failed open, so the next call can try again.
  opening.catch(() => {
    if (databasePromise === opening) databasePromise = null;
  });
  return opening;
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

  // Do not close the shared connection here (see openDatabase).
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
