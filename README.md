# SpeakLab

SpeakLab is a browser-based English speaking practice studio. It provides topic challenges, shadowing practice, local recording playback, speech transcription, and AI-powered feedback.

## Features

- Accounts with Clerk — every practice recording is saved to the signed-in user's account
- Recordings stored in Vercel Blob under `recordings/{userId}/`, uploaded straight
  from the browser (large videos never pass through a serverless body limit),
  with metadata documents for transcripts, metrics, and AI feedback
- Topic-based speaking challenges with generated questions and follow-up prompts
- Shadowing practice with curated video exercises
- Browser recording and saved recording playback
- Reliable speech transcription for short and long (10+ minute) recordings:
  - hosted OpenAI-compatible Whisper API (e.g. Groq) — the zero-setup path
    that works on hosted platforms like Vercel
  - free local Whisper fallback when the API is not configured
  - long recordings are decoded in the browser to 16 kHz mono WAV and split
    into request-sized segments that are transcribed in order and merged
- Speaking feedback through the NVIDIA NIM chat-completions API, with a deterministic local fallback when the API is unavailable
- Local fallback questions when question generation is unavailable

## Requirements

- Node.js 20 or newer
- npm
- For transcription on a hosted platform (e.g. Vercel), a free API key from
  an OpenAI-compatible Whisper provider such as
  [Groq](https://console.groq.com/) — nothing else to install
- Alternatively, to run transcription fully locally: Whisper installed and
  available on `PATH` (free, local speech-to-text) and FFmpeg on `PATH` to
  decode non-WAV browser recordings
- A [Clerk](https://dashboard.clerk.com/) application — publishable + secret keys (required)
- A [Vercel Blob](https://vercel.com/docs/vercel-blob) store — read-write token (required for saving recordings)
- An NVIDIA API key for AI-generated questions and evaluation (optional; evaluation has a local fallback)

## Setup

1. Install dependencies:

	```bash
	npm ci
	```

2. Create a Clerk application at [dashboard.clerk.com](https://dashboard.clerk.com/)
   and copy its publishable and secret keys from **API keys**.

3. Create a Vercel Blob store (Vercel dashboard → Storage → Blob, or
   `npx vercel blob` flow / your Vercel project's Storage tab) and copy the
   `BLOB_READ_WRITE_TOKEN`. On Vercel deployments you can attach the store to
   the project and the variable is provided automatically.

4. Create `.env.local` in the project root (see [.env.example](./.env.example)):

	```env
	# Clerk (https://dashboard.clerk.com → API keys)
	NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
	CLERK_SECRET_KEY=sk_test_...
	NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
	NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
	NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/practice/topic
	NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/practice/topic
	NEXT_PUBLIC_CLERK_SIGN_OUT_FALLBACK_REDIRECT_URL=/

	# Vercel Blob recording storage
	BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...

	NVIDIA_API_KEY=your_nvidia_api_key
	# Optional: override the default NVIDIA model candidates.
	NVIDIA_MODEL=your_model_name

	# Hosted transcription (recommended for Vercel): set the full endpoint and
	# a key, e.g. Groq free tier (https://console.groq.com/):
	WHISPER_API_URL=https://api.groq.com/openai/v1/audio/transcriptions
	WHISPER_API_KEY=your_groq_api_key
	# Optional overrides for the hosted API:
	# WHISPER_MODEL=whisper-large-v3-turbo   (default when WHISPER_API_URL is set)
	# WHISPER_LANGUAGE=en

	# Alternative: free local Whisper. Used only when WHISPER_API_URL is NOT set.
	# WHISPER_BINARY=whisper
	# small.en is the fast default; use large-v3 when maximum accuracy matters.
	# WHISPER_MODEL=small.en
	# WHISPER_LANGUAGE=en
	```

	Keep `.env.local` private. It is ignored by Git and must never be committed or published.

5. Start the development server:

	```bash
	npm run dev
	```

6. Open [http://localhost:3000](http://localhost:3000), sign in, and record —
   recordings now upload to your account.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Next.js development server |
| `npm run lint` | Run ESLint |
| `npm run test` | Run the vitest regression suite |
| `npm run build` | Create a production build |
| `npm run start` | Serve the production build |

## Regression safety

Before changing anything in this repository, read
[`REGRESSION_FIREWALL.md`](./REGRESSION_FIREWALL.md). After meaningful
changes, run `npm test`, `npm run lint`, and `npm run build`.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | SpeakLab home page |
| `/practice` | Practice hub |
| `/practice/topic` | Topic challenge practice |
| `/practice/recordings` | Review saved recordings and feedback (sign-in required) |
| `/practice/shadow/[videoId]` | Shadowing practice for a selected video |
| `/sign-in`, `/sign-up` | Clerk authentication pages |

## API routes

| Route | Purpose |
| --- | --- |
| `/api/generate-question` | Generate a speaking question |
| `/api/evaluate` | Evaluate a recorded response |
| `/api/transcribe` | Transcribe audio with Whisper (sign-in required) |
| `/api/recordings` | List the signed-in user's saved recordings |
| `/api/recordings/upload` | Issues direct-to-blob upload tokens (Clerk-scoped) |
| `/api/recordings/[id]/metadata` | Create/update one recording's metadata |
| `/api/recordings/[id]` | Delete one recording (metadata + media) |

## Accounts and recording storage

- `/practice/topic` (recording flow) and `/practice/recordings` require sign-in.
  Signed-out visitors are redirected to `/sign-in` and returned afterwards.
- Recordings upload directly from the browser to Vercel Blob and are stored
  under `recordings/{userId}/…` with a random URL suffix. Every API route
  re-checks the Clerk session and rejects paths outside the caller's own
  folder, so one account can never read or write another's recordings.
- Recordings made before sign-in existed remain in the browser's IndexedDB;
  the recordings page lists them under "Saved on this device only" with a
  one-click "Save to account" migration button.
- If the blob store is unreachable, the topic flow falls back to the original
  local IndexedDB save so a take is never lost.
- **Without Clerk keys** (and only then) the app deliberately runs in a
  browsable no-auth mode: the navbar looks unchanged, gated pages bounce to a
  "sign-in is not set up" notice, and the recording/AI APIs return an explicit
  503 message instead of crashing. Add the keys and everything switches on.
- Media blob URLs are unguessable but not access-controlled (standard Vercel
  Blob `access: "public"` model). Treat recording URLs as secrets; if you need
  authenticated media delivery, move the store to `access: "private"` and add
  a signed-URL endpoint.

## Data and privacy

Practice state is stored locally in the browser; recordings are stored in the account's Vercel Blob store. API keys are server-side environment variables and should not be exposed in client code. Review the provider terms and privacy requirements before sending audio or transcripts to external services.
