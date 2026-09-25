import { NextResponse } from "next/server";
import { del, list } from "@vercel/blob";
import { recordingsPrefixFor, sanitizeRecordingId } from "@/lib/recordingPaths";
import { currentUserId, isClerkConfigured } from "@/lib/authGate";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Deletes one recording of the signed-in user: the metadata JSON and every
 * media variant found under the recording id (the media blob carries a
 * server-generated random suffix, so its exact extension is looked up).
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isClerkConfigured()) {
    return NextResponse.json(
      { error: "Accounts are not configured on this deployment. Add the Clerk keys (see README)." },
      { status: 503 },
    );
  }
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to manage your recordings." }, { status: 401 });
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

  // `recordings/{userId}/{id}.` matches both `{id}.json` and the suffixed
  // media (`{id}.xxxxx.webm`) while never touching a different recording
  // whose id merely starts with the same characters (`{id}2…`).
  const prefix = `${recordingsPrefixFor(userId)}${recordingId}.`;

  try {
    const pathsToDelete: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix, cursor, limit: 1000 });
      for (const blob of page.blobs) pathsToDelete.push(blob.pathname);
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);

    if (pathsToDelete.length > 0) {
      await del(pathsToDelete);
    }
    return NextResponse.json({ deleted: pathsToDelete.length });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "The recording could not be deleted.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
