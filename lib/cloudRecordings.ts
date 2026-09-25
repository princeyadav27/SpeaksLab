"use client";

import { upload } from "@vercel/blob/client";
import {
  MAX_MEDIA_BYTES,
  safeExtensionForContentType,
  type CloudRecordingMetadata,
} from "@/lib/recordingPaths";

/**
 * Browser-side helpers for per-account recording storage. Every function
 * talks to `/api/recordings/*`, which authorizes with Clerk and scopes all
 * storage access to the signed-in user's own folder — the client never
 * learns or chooses where its files live beyond that.
 */

async function errorFromResponse(response: Response, fallback: string): Promise<Error> {
  try {
    const data = (await response.json()) as { error?: string };
    if (data.error) return new Error(data.error);
  } catch {
    // fall through to the fallback message
  }
  return new Error(fallback);
}

/** Uploads the recorded media straight from the browser to blob storage. */
export async function uploadRecordingMedia(
  blob: Blob,
  options: {
    userId: string;
    recordingId: string;
    onProgress?: (percent: number) => void;
  },
): Promise<{ url: string; pathname: string }> {
  const { userId, recordingId, onProgress } = options;
  if (blob.size > MAX_MEDIA_BYTES) {
    throw new Error("This recording is too large to save to your account (max 1 GB).");
  }

  const result = await upload(`recordings/${userId}/${recordingId}.${safeExtensionForContentType(blob.type || "video/webm")}`, blob, {
    access: "public",
    handleUploadUrl: "/api/recordings/upload",
    onUploadProgress: (event) => {
      if (!onProgress) return;
      if (event.total > 0) {
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      }
    },
  });
  return { url: result.url, pathname: result.pathname };
}

/** Creates or updates the metadata document for a recording. */
export async function saveRecordingMetadata(
  metadata: Omit<CloudRecordingMetadata, "storage"> & { storage?: "cloud" },
): Promise<CloudRecordingMetadata> {
  const response = await fetch(`/api/recordings/${encodeURIComponent(metadata.id)}/metadata`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...metadata, storage: "cloud" }),
  });
  if (!response.ok) {
    throw await errorFromResponse(response, "The recording could not be saved to your account.");
  }
  const data = (await response.json()) as { recording: CloudRecordingMetadata };
  return data.recording;
}

/** Lists every recording saved to the signed-in account. */
export async function fetchCloudRecordings(): Promise<CloudRecordingMetadata[]> {
  const response = await fetch("/api/recordings", { cache: "no-store" });
  if (!response.ok) {
    throw await errorFromResponse(response, "Your recordings could not be loaded.");
  }
  const data = (await response.json()) as { recordings: CloudRecordingMetadata[] };
  return data.recordings ?? [];
}

/** Deletes one recording (metadata + media) from the account. */
export async function deleteCloudRecording(recordingId: string): Promise<void> {
  const response = await fetch(`/api/recordings/${encodeURIComponent(recordingId)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw await errorFromResponse(response, "The recording could not be deleted from your account.");
  }
}

/**
 * Loads a cloud recording's media as a Blob so the existing blob-based
 * playback and transcription flows keep working unchanged.
 */
export async function fetchRecordingMediaBlob(mediaUrl: string): Promise<Blob> {
  const response = await fetch(mediaUrl);
  if (!response.ok) {
    throw new Error("The recording media could not be loaded from your account.");
  }
  return await response.blob();
}
