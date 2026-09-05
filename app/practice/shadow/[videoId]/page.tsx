import Link from "next/link";
import { notFound } from "next/navigation";
import Navbar from "@/components/Navbar";
import DeleteShadowVideoButton from "@/components/DeleteShadowVideoButton";
import {
  getShadowVideoById,
  getYouTubeEmbedUrl,
  getYouTubeWatchUrl,
  isYouTubeVideoId,
  type ShadowDifficulty,
} from "@/lib/shadowVideos";

type Props = {
  params: Promise<{ videoId: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { videoId } = await params;
  const curatedVideo = getShadowVideoById(videoId);
  const video = curatedVideo ?? (isYouTubeVideoId(videoId) ? {
    id: videoId,
    title: "Custom YouTube video",
    speaker: "Your selected video",
    source: "YouTube",
    durationLabel: "Custom",
    difficulty: "medium" as const,
    description: "Practice this video by listening closely, then repeating the speaker's rhythm, pauses, and tone.",
    durationISO: "",
  } : null);
  if (!video) return { title: "Shadow Speaking — SpeakLab" };
  return {
    title: `${video.title} — Shadow Speaking`,
    description: `Shadow ${video.speaker} — ${video.title}`,
  };
}

function difficultyStyle(level: ShadowDifficulty): string {
  switch (level) {
    case "easy":
      return "bg-emerald-50 text-emerald-800 border-emerald-900/15";
    case "medium":
      return "bg-[#eef1fa] text-cobalt border-cobalt/20";
    case "hard":
      return "bg-[#f8e6e6] text-[#8b3c3c] border-[#8b3c3c]/15";
  }
}

export default async function ShadowPracticePage({ params }: Props) {
  const { videoId } = await params;
  const curatedVideo = getShadowVideoById(videoId);
  const video = curatedVideo ?? (isYouTubeVideoId(videoId) ? {
    id: videoId,
    title: "Custom YouTube video",
    speaker: "Your selected video",
    source: "YouTube",
    durationLabel: "Custom",
    difficulty: "medium" as const,
    description: "Practice this video by listening closely, then repeating the speaker's rhythm, pauses, and tone.",
    durationISO: "",
  } : null);
  if (!video) notFound();

  const embedUrl = getYouTubeEmbedUrl(video);
  const watchUrl = getYouTubeWatchUrl(video);

  return (
    <main className="paper-surface relative min-h-svh bg-ivory text-ink">
      <div className="relative z-10 flex min-h-svh flex-col">
        <Navbar variant="solid" />

        <section className="mx-auto w-full max-w-[1180px] flex-1 px-5 pb-16 pt-8 sm:px-8 lg:px-12">

          {/* ── Back link ──────────────────────────────────────────────── */}
          <Link
            href="/practice"
            className="inline-flex items-center gap-1 text-[11px] tracking-[0.18em] text-cobalt"
          >
            ‹ BACK TO LIBRARY
          </Link>

          {/* ── Top section: video + metadata ─────────────────────────── */}
          <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">

            {/* Video player */}
            <div className="self-start overflow-hidden rounded-2xl border border-ink/10 bg-ink">
              <div className="relative block aspect-video w-full self-start">
                <iframe
                  src={embedUrl}
                  title={video.title}
                  className="absolute inset-0 block h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              </div>
            </div>

            {/* Side metadata */}
            <aside className="flex flex-col">
              <p className="text-[10.5px] uppercase tracking-[0.18em] text-cobalt">
                SHADOW PRACTICE
              </p>
              <h1 className="mt-2 font-display text-[clamp(1.7rem,3.4vw,2.3rem)] leading-[1.1] text-ink">
                {video.title}
              </h1>
              <p className="mt-1 text-[14px] text-ink/55">
                {video.speaker}
              </p>

              {/* Meta chips */}
              <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px]">
                <span className="rounded-full border border-ink/10 bg-[#f5efe5] px-2.5 py-1 text-ink/70">
                  {video.source}
                </span>
                <span
                  className={`rounded-full border px-2.5 py-1 ${difficultyStyle(video.difficulty)}`}
                >
                  {video.difficulty}
                </span>
                <span className="rounded-full border border-ink/10 bg-[#f5efe5] px-2.5 py-1 font-mono text-ink/70">
                  {video.durationLabel}
                </span>
              </div>

              <p className="mt-5 text-[14px] leading-relaxed text-ink/70">
                {video.description}
              </p>

              {/* Practice instructions */}
              <div className="mt-6 rounded-2xl border border-cobalt/20 bg-[#eef1fa] px-4 py-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-cobalt/80">
                  Practice
                </p>
                <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink">
                  Listen carefully. Follow the speaker and repeat out loud.
                </p>
                <ol className="mt-3 space-y-1.5 text-[13px] leading-relaxed text-ink/75">
                  <li className="flex gap-2"><span className="text-ink/40">1.</span>Press play and watch once through.</li>
                  <li className="flex gap-2"><span className="text-ink/40">2.</span>Replay. Pause after each sentence.</li>
                  <li className="flex gap-2"><span className="text-ink/40">3.</span>Shadow the speaker out loud — match their pace, pauses, and tone.</li>
                </ol>
              </div>

              {/* External open */}
              <a
                href={watchUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-5 text-[12px] text-ink/45 hover:text-ink/70"
              >
                Open on YouTube ↗
              </a>

              <DeleteShadowVideoButton videoId={videoId} />
            </aside>
          </div>

          {/* ── Bottom: more practice ─────────────────────────────────── */}
          <div className="mt-14 border-t border-ink/10 pt-8">
            <p className="text-[11px] uppercase tracking-[0.18em] text-ink/40">
              Next step
            </p>
            <h2 className="mt-1 font-display text-[1.55rem] text-ink">
              Try the same speaker, then pick a new voice.
            </h2>
            <p className="mt-2 max-w-[34rem] text-[14px] leading-relaxed text-ink/55">
              Shadow the same clip a few times in one sitting — fluency comes
              from repetition, not novelty.
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/practice"
                className="inline-flex items-center gap-2 rounded-md border border-ink/15 bg-[#f4ecdf] px-5 py-2.5 text-[14px] font-medium text-ink hover:border-cobalt/40 hover:text-cobalt"
              >
                ↻ Try Again
              </Link>
              <Link
                href="/practice"
                className="inline-flex items-center gap-2 rounded-md bg-cobalt px-5 py-2.5 text-[14px] font-medium text-ivory hover:bg-cobalt-deep"
              >
                New Speaker →
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
