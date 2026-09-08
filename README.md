# SpeakLab

SpeakLab is a browser-based English speaking practice studio. It provides topic challenges, shadowing practice, local recording playback, speech transcription, and AI-powered feedback.

## Features

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
- An NVIDIA API key for AI-generated questions and evaluation (optional; evaluation has a local fallback)

## Setup

1. Install dependencies:

	```bash
	npm ci
	```

2. Create `.env.local` in the project root:

	```env
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
	WHISPER_BINARY=whisper
	# small.en is the fast default; use large-v3 when maximum accuracy matters.
	WHISPER_MODEL=small.en
	WHISPER_LANGUAGE=en
	```

	Keep `.env.local` private. It is ignored by Git and must never be committed or published.

3. Start the development server:

	```bash
	npm run dev
	```

4. Open [http://localhost:3000](http://localhost:3000).

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
| `/practice/recordings` | Review saved recordings and feedback |
| `/practice/shadow/[videoId]` | Shadowing practice for a selected video |

## API routes

| Route | Purpose |
| --- | --- |
| `/api/generate-question` | Generate a speaking question |
| `/api/evaluate` | Evaluate a recorded response |
| `/api/transcribe` | Transcribe audio with Whisper |

## Data and privacy

Practice state and recordings are stored locally in the browser or local project data. API keys are server-side environment variables and should not be exposed in client code. Review the provider terms and privacy requirements before sending audio or transcripts to external services.
