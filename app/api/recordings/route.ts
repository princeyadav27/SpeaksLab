import { NextResponse } from "next/server";
import { list } from "@vercel/blob";
import { parseRecordingMetadata, recordingsPrefixFor, type CloudRecordingMetadata } from "@/lib/recordingPaths";
import { currentUserId, isClerkConfigured } from "@/lib/authGate";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_LISTED_BLOBS = 2000;

/**
 * Lists the signed-in user's recordings. The blob store only holds objects,
 * so the listing walks `recordings/{userId}/*.json` metadata blobs and reads
 * each one. Media itself is never transferred here — clients stream it from
 * the `mediaUrl` stored in the metadata.
 */
export async function GET() {
  if (!isClerkConfigured()) {
    return NextResponse.json(
      { error: "Accounts are not configured on this deployment. Add the Clerk keys (see README)." },
      { status: 503 },
    );
  }
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to view your recordings." }, { status: 401 });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Recording storage is not configured. Add BLOB_READ_WRITE_TOKEN to the environment." },
      { status: 503 },
    );
  }

  const prefix = recordingsPrefixFor(userId);

  try {
    const metadataBlobs: { url: string; pathname: string }[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix, cursor, limit: 1000 });
      for (const blob of page.blobs) {
        if (blob.pathname.endsWith(".json")) metadataBlobs.push({ url: blob.url, pathname: blob.pathname });
      }
      cursor = page.hasMore ? page.cursor : undefined;
      if (metadataBlobs.length >= MAX_LISTED_BLOBS) break;
    } while (cursor);

    const recordings: CloudRecordingMetadata[] = [];
    const brokenPaths: string[] = [];
    // Read metadata sequentially — a user has tens of recordings, not
    // thousands, and this keeps request pressure on the store minimal.
    for (const blob of metadataBlobs) {
      try {
        const response = await fetch(blob.url, { cache: "no-store" });
        if (!response.ok) throw new Error(`Metadata fetch failed (${response.status}).`);
        const parsed = parseRecordingMetadata(await response.json(), {
          userId,
          recordingId: blob.pathname.slice(prefix.length).replace(/\.json$/, ""),
        });
        recordings.push(parsed);
      } catch {
        // One corrupt/foreign metadata blob must not hide the whole library.
        brokenPaths.push(blob.pathname);
      }
    }

    recordings.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    return NextResponse.json({ recordings, broken: brokenPaths });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Your recordings could not be loaded.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
