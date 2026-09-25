import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import {
  ALLOWED_MEDIA_CONTENT_TYPES,
  assertOwnedRecordingPath,
  MAX_MEDIA_BYTES,
} from "@/lib/recordingPaths";
import { currentUserId, isClerkConfigured } from "@/lib/authGate";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Issues direct-to-blob upload tokens for signed-in users. The browser calls
 * `upload()` from `@vercel/blob/client` with `handleUploadUrl` pointing here,
 * so large practice recordings never pass through a serverless request body.
 *
 * Every issued token is scoped to `recordings/{userId}/…` of the signed-in
 * user only; anything else is rejected before a token exists.
 */
export async function POST(request: Request) {
  const userId = isClerkConfigured() ? await currentUserId() : null;
  if (!isClerkConfigured()) {
    return NextResponse.json(
      { error: "Accounts are not configured on this deployment. Add the Clerk keys (see README)." },
      { status: 503 },
    );
  }
  if (!userId) {
    return NextResponse.json({ error: "Sign in to save recordings to your account." }, { status: 401 });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Recording storage is not configured. Add BLOB_READ_WRITE_TOKEN to the environment." },
      { status: 503 },
    );
  }

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // Hard ownership check: the client may only upload media into its
        // own per-user folder, whatever pathname it sends.
        assertOwnedRecordingPath(userId, pathname);
        return {
          allowedContentTypes: [...ALLOWED_MEDIA_CONTENT_TYPES],
          maximumSizeInBytes: MAX_MEDIA_BYTES,
          // A random suffix makes the final media URL unguessable even for
          // recordings whose id is visible in the app UI.
          addRandomSuffix: true,
        };
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The upload could not be authorized.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
