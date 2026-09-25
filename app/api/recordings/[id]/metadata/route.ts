import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import {
  metadataPathFor,
  parseRecordingMetadata,
  sanitizeRecordingId,
} from "@/lib/recordingPaths";
import { currentUserId, isClerkConfigured } from "@/lib/authGate";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Cap for the metadata JSON document (transcripts included, media never). */
const MAX_METADATA_BYTES = 1024 * 1024; // 1 MB

/**
 * Creates or updates the metadata document for one recording (first save,
 * then transcript and evaluation updates). The media blob itself is uploaded
 * by the browser directly; this route only ever writes
 * `recordings/{userId}/{id}.json` inside the signed-in user's own folder.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isClerkConfigured()) {
    return NextResponse.json(
      { error: "Accounts are not configured on this deployment. Add the Clerk keys (see README)." },
      { status: 503 },
    );
  }
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to save recordings to your account." }, { status: 401 });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Recording storage is not configured. Add BLOB_READ_WRITE_TOKEN to the environment." },
      { status: 503 },
    );
  }

  const { id } = await params;
  let recordingId: string;
  try {
    recordingId = sanitizeRecordingId(id);
  } catch {
    return NextResponse.json({ error: "Invalid recording id." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  let metadata;
  try {
    metadata = parseRecordingMetadata(body, { userId, recordingId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid recording metadata.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const serialized = JSON.stringify(metadata);
  if (serialized.length > MAX_METADATA_BYTES) {
    return NextResponse.json({ error: "Recording metadata is too large to save." }, { status: 413 });
  }

  try {
    await put(metadataPathFor(userId, recordingId), serialized, {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 10, // metadata changes often (transcript, evaluation)
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "The recording could not be saved to your account.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  return NextResponse.json({ recording: metadata });
}
