# SpeakLab

SpeakLab is a browser-based English speaking practice studio. It provides topic challenges, shadowing practice, local recording playback, speech transcription, and AI-powered feedback.

## Features

- Topic-based speaking challenges with generated questions and follow-up prompts
- Shadowing practice with curated video exercises
- Browser recording and saved recording playback
- Speech transcription through free, local Whisper (browser WebM/Ogg is normalized to 16 kHz mono WAV first)
- Speaking feedback through the NVIDIA NIM chat-completions API, with a deterministic local fallback when the API is unavailable
- Local fallback questions when question generation is unavailable

## Requirements

- Node.js 20 or newer
- npm
- Whisper installed and available on `PATH` for transcription features (free, local speech-to-text)
- FFmpeg installed and available on `PATH` to decode browser recordings
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
   # Optional: configure the free local Whisper executable and model.
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
| `npm run build` | Create a production build |
| `npm run start` | Serve the production build |

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
