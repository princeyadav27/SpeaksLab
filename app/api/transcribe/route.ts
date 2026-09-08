import { NextResponse } from "next/server";
import {
  AudioDecodeError,
  selectBackend,
  transcribeWithApi,
  transcribeWithLocalWhisper,
  type TranscriptionResult,
} from "@/lib/transcribeBackend";
import { MAX_UPLOAD_BYTES, formatBytes } from "@/lib/transcriptionShared";

export const runtime = "nodejs";

/**
 * Encode a backend result into the HTTP response the client expects.
 * Success shape is unchanged from the original route:
 *   { transcript, model }        (200)
 *   { error }                    (4xx/5xx)
 */
function toResponse(result: TranscriptionResult): NextResponse {
  if (result.ok) {
    return NextResponse.json({
      transcript: result.transcript,
      model: result.model,
    });
  }
  return NextResponse.json({ error: result.error }, { status: result.status });
}

export async function POST(request: Request) {
  // Parse the multipart body separately: a malformed request is a client
  // error (400), not a missing-dependency server error (500).
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (error) {
    return NextResponse.json(
      {
        error: `Expected a multipart/form-data upload with a "file" field. ${
          error instanceof Error ? error.message : ""
        }`.trim(),
      },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: 'No audio/video file was provided. Send it as a "file" field.' },
      { status: 400 },
    );
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "The uploaded file is empty." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        error: `The recording is larger than ${formatBytes(MAX_UPLOAD_BYTES)}. Long recordings are split into smaller audio segments before upload, so try transcribing again.`,
      },
      { status: 413 },
    );
  }

  let uploadBytes: ArrayBuffer;
  try {
    uploadBytes = await file.arrayBuffer();
  } catch (error) {
    return NextResponse.json(
      { error: `The upload could not be read. ${error instanceof Error ? error.message : ""}`.trim() },
      { status: 400 },
    );
  }

  const backend = selectBackend();
  // Client marks segment uploads of a chunked long recording. A silent
  // segment inside such a recording is a valid empty result; silence in a
  // single whole-recording upload is still an error.
  const rawAllowEmpty = formData.get("allowEmpty");
  const allowEmpty =
    rawAllowEmpty === "1" || rawAllowEmpty === "true";

  try {
    let result: TranscriptionResult;
    if (backend.kind === "api") {
      if (!backend.config.apiKey) {
        return NextResponse.json(
          {
            error: "Transcription is unavailable: WHISPER_API_KEY is not set on the server even though WHISPER_API_URL is configured.",
          },
          { status: 503 },
        );
      }
      result = await transcribeWithApi(
        {
          buffer: uploadBytes,
          mimeType: file.type,
          name: file.name,
        },
        { ...backend.config, allowEmpty },
      );
    } else {
      result = await transcribeWithLocalWhisper(
        Buffer.from(uploadBytes),
        file.type,
        file.name,
        allowEmpty,
      );
    }

    if (result.ok) return toResponse(result);

    console.error(`Transcription error (${result.status}):`, result.error);
    return toResponse(result);
  } catch (error) {
    console.error("Transcription error:", error);
    const message = error instanceof Error ? error.message : "Unknown transcription error.";

    // A corrupt upload is a client error, not a toolchain problem.
    if (error instanceof AudioDecodeError) {
      return NextResponse.json(
        { error: `The recording could not be decoded as audio. Try re-recording. ${message}` },
        { status: 400 },
      );
    }

    // Only claim a missing toolchain when that is actually what happened;
    // otherwise surface the real reason.
    const missingTool = /ENOENT|Whisper is unavailable|not on PATH/.test(message);
    const status = missingTool ? 503 : 500;
    return NextResponse.json(
      {
        error: missingTool
          ? `Transcription is unavailable on this server. Set WHISPER_API_URL (hosted Whisper API) or install Whisper and FFmpeg, then try again. ${message}`
          : `Transcription failed. ${message}`,
      },
      { status },
    );
  }
}
