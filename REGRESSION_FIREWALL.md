# REGRESSION FIREWALL

> **Every future coding agent working on this repository MUST read this file
> before making changes.**
>
> Core rule: **Fix forward without breaking backward.**

This repository is a shipped, hosted product with real users and working
functionality. Any change — a bug fix, feature, or refactor — can silently
break something that already works. This firewall exists to prevent that.

## The rules

1. **Never assume a working feature can be safely changed without testing it.**
   Inspect first. Trace the data flow end to end before touching code.
2. **Never rewrite working components unnecessarily.** Prefer small, isolated
   changes that fit the existing architecture.
3. **Never perform unrelated refactoring while fixing a bug.** If you notice
   something you want to clean up, write it down — do not do it in the same
   change.
4. **Preserve existing API contracts** (`/api/generate-question`,
   `/api/evaluate`, `/api/transcribe`) unless a change is genuinely required.
   Client code depends on their exact response shapes and status codes.
5. **Preserve existing UI behavior** unless the bug being fixed requires a UI
   change. Users depend on the current flows, labels, and states.
6. **After every meaningful change, run the regression suite:**
   `npm test` (and `npm run lint`, `npm run build` before finishing).
7. **If a new fix breaks an existing feature, revert or redesign the change.**
   A fix is NOT complete if the target bug is fixed but another feature is
   broken.
8. **Do not claim success without verification.** No fake/mock success states,
   no "tests passed" unless they ran, no "production verified" unless a real
   production flow was exercised.

## Required workflow

```
Inspect  →  Baseline  →  Reproduce  →  Change  →  Test
→  Regression test  →  Build  →  Deploy  →  Production verification
```

- **Inspect** the full pipeline (frontend, backend, data flow, env vars,
  deployment) before writing code.
- **Baseline**: confirm `git status` is clean and note the current commit so a
  bad change can always be reverted.
- **Reproduce**: know why the bug happens before you fix it. No speculative
  fixes.
- **Change**: smallest safe change; keep commits logically separated
  (e.g. `fix:`, `test:`, `hardening:`).
- **Test + regression**: run `npm test`. Existing tests must continue to pass.
- **Build**: `npm run build` must succeed.
- **Deploy + verify**: when access exists, verify on the hosted version and be
  honest about what could and could not be verified.

## Protected surfaces (do not break these)

- Recording (mic-only and camera+mic), save-to-IndexedDB, and playback
- Transcription UI + transcript display + copy
- AI evaluation flow and its 8-dimension scorecard rendering
- The Topic Challenge wheel experience and session state
- Shadow Speaking library, custom YouTube URL practice, delete-video cookie
- Recordings library: search, filter, pagination, delete, share
- All `/api/*` endpoints and their contracts
- Env-var conventions (`.env.local` only; `NVIDIA_*`, `WHISPER_*` keys)
- Deployment configuration (Next.js, Vercel-ready)

## Transcription architecture (as of the reliable-transcription fix)

The transcription pipeline intentionally supports two backends behind one
unchanged HTTP contract. `POST /api/transcribe` with a multipart `file`
returns `{ transcript, model }` on success and `{ error }` otherwise.

- **Backend 1 — hosted Whisper API (default for hosted deploys).** Enabled by
  `WHISPER_API_URL` (e.g. `https://api.groq.com/openai/v1/audio/transcriptions`)
  plus `WHISPER_API_KEY`. `WHISPER_MODEL` defaults to `whisper-large-v3-turbo`,
  `WHISPER_LANGUAGE` to `en`. Lives in `lib/transcribeBackend.ts`
  (`transcribeWithApi`). No local binaries needed — this is what makes
  transcription work on Vercel.
- **Backend 2 — local Whisper CLI.** Used when `WHISPER_API_URL` is unset and
  `whisper` + `ffmpeg` are installed on the server (`transcribeWithLocalWhisper`).
- **Client pipeline** (`lib/transcriptionClient.ts`, used by the Topic
  Challenge save flow and the My Recordings page):
  - Files ≤ 4 MB are uploaded **as-is** in one request (no decode).
  - Larger files (long camera videos) have their audio track decoded in the
    browser, normalized to **16 kHz mono WAV**, split into bounded
    segments (≤ 90 seconds / ~2.88 MB each), uploaded sequentially, and merged in order
    (`lib/transcriptionShared.ts`: `planWavChunks`, `wavBytesFromPcm16`,
    `mergeTranscriptChunks`).
- **Tests**: `npm test` (vitest) covers chunk planning, WAV encoding, transcript
  merging, backend selection, provider error mapping, and local whisper WAV handling in
  `tests/transcriptionShared.test.ts` and `tests/transcribeBackend.test.ts`.
  Add tests whenever you change transcription logic.

## Recordings storage (IndexedDB)

`lib/recordingsDb.ts` stores recordings in the browser database
`speaklab-recordings` (schema **version 2**):

- `recordings` holds lightweight metadata only (listing, transcript, metrics,
  evaluation); `recording-blobs` holds the media as `{ id, blob }`. The
  My Recordings page lists metadata and lazy-loads the selected media with
  `getRecordingBlob`.
- Opening version 2 migrates version-1 data (blob embedded in each record)
  into `recording-blobs`. Never lower `DB_VERSION`: users' browsers are already
  on version 2, and a lower version fails to open.
- **One connection is shared by every helper and must never be closed by a
  helper.** A closed connection stays cached and every later call fails with
  `InvalidStateError: The database connection is closing` (this shipped once:
  saved videos stopped loading and saving/deleting failed).
- **Tests**: `tests/recordingsDb.test.ts` runs the real module against
  `fake-indexeddb` (shared connection, save/delete after listing, media kept
  when metadata is saved without a blob, v1 → v2 migration). Extend it
  whenever you change this module.
- **Saved evaluations are user data too.** `validateEvaluation` also decides
  whether My Recordings *displays* an already-saved evaluation, so never make
  it stricter than what older versions saved (e.g. older evaluations can hold a
  decimal `questionRelevance.score`). Normalise new model output in the
  evaluate route (`coerceModelEvaluation`) instead. Covered by
  `tests/aiEvaluation.test.ts` and `tests/evaluateRoute.test.ts`.

## Env vars quick reference

| Var | Meaning |
| --- | --- |
| `WHISPER_API_URL` | Full OpenAI-compatible transcriptions URL (hosted API mode) |
| `WHISPER_API_KEY` | Bearer key for the hosted API |
| `WHISPER_MODEL` | API mode default `whisper-large-v3-turbo`; local default `small.en` |
| `WHISPER_LANGUAGE` | Default `en` |
| `WHISPER_TIMEOUT_MS` | Optional request timeout in ms (default 300,000) |
| `WHISPER_BINARY` | Local Whisper executable (local mode only) |
| `NVIDIA_API_KEY` / `NVIDIA_MODEL` | AI question generation & evaluation |
