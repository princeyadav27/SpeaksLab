import Link from "next/link";
import { cookies } from "next/headers";
import Navbar from "@/components/Navbar";
import CustomYouTubeVideoForm from "@/components/CustomYouTubeVideoForm";
import {
  getRecommendedShadowVideos,
  getShadowCollections,
  getPlaylistUrl,
  type ShadowDifficulty,
} from "@/lib/shadowVideos";

const HIDDEN_VIDEOS_COOKIE = "speaklab-hidden-shadow-videos";

export const metadata = {
  title: "Shadow Speaking — SpeakLab",
  description: "Listen. Follow. Repeat. A library of English speakers to shadow.",
};

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

type PracticePageProps = {
  searchParams: Promise<{ deleted?: string }>;
};

export default async function PracticePage({ searchParams }: PracticePageProps) {
  const recommended = getRecommendedShadowVideos();
  const collections = getShadowCollections();
  const { deleted } = await searchParams;
  const cookieValue = (await cookies()).get(HIDDEN_VIDEOS_COOKIE)?.value ?? "";
  const decodedCookieValue = decodeURIComponent(cookieValue);
  const hiddenIds = new Set(
    `${decodedCookieValue},${deleted ?? ""}`.split(",").filter(Boolean),
  );
  const visibleRecommended = recommended.filter((video) => !hiddenIds.has(video.id));

  return (
    <main className="paper-surface relative min-h-svh bg-ivory text-ink">
      <div className="relative z-10 flex min-h-svh flex-col">
        <Navbar variant="solid" />

        <section className="mx-auto w-full max-w-[1180px] flex-1 px-5 pb-16 pt-10 sm:px-8 lg:px-12">
          {/* ── Header ──────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-1">
            <p className="text-[11px] font-medium tracking-[0.22em] text-cobalt">
              SHADOW SPEAKING
            </p>
            <h1 className="mt-2 font-display text-[clamp(2.1rem,5vw,3.4rem)] leading-[1.05] text-ink">
              <span className="block">Listen. Follow. Repeat.</span>
            </h1>
            <p className="mt-3 max-w-[34rem] text-[14px] leading-relaxed text-ink/55">
              Pick a speaker you want to sound like. Watch, listen, and repeat
              out loud — matching the rhythm, the pauses, and the tone.
            </p>
          </div>

          <CustomYouTubeVideoForm />

          {/* ── Recommended ────────────────────────────────────────────── */}
          <div className="mt-12">
            <div className="mb-5 flex items-end justify-between gap-3">
              <h2 className="font-display text-[1.65rem] text-ink">Recommended</h2>
              <p className="text-[11px] uppercase tracking-[0.18em] text-ink/40">
                {visibleRecommended.length} speakers
              </p>
            </div>

            <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {visibleRecommended.map((v) => {
                const thumb = `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`;
                return (
                  <li
                    key={v.id}
                    className="group flex flex-col overflow-hidden rounded-2xl border border-ink/10 bg-[#fbf7ef] transition-transform duration-500 ease-out hover:-translate-y-0.5"
                  >
                    <Link
                      href={`/practice/shadow/${v.id}`}
                      className="flex h-full flex-col"
                      aria-label={`Open ${v.title} for shadowing practice`}
                    >
                      {/* Thumbnail */}
                      <div className="relative aspect-video w-full overflow-hidden bg-ink/5">
                        {/* Plain img — YouTube CDN, no Next/Image optimization needed */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={thumb}
                          alt=""
                          className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                          loading="lazy"
                        />
                        {/* Duration chip */}
                        <span className="absolute bottom-2 right-2 rounded-md bg-ink/85 px-1.5 py-0.5 font-mono text-[11px] text-ivory">
                          {v.durationLabel}
                        </span>
                      </div>

                      {/* Body */}
                      <div className="flex flex-1 flex-col p-4">
                        <div className="flex items-center gap-2 text-[10.5px] uppercase tracking-[0.14em] text-ink/45">
                          <span>{v.source}</span>
                          <span aria-hidden="true">·</span>
                          <span
                            className={`rounded-full border px-2 py-0.5 normal-case tracking-[0.04em] ${difficultyStyle(v.difficulty)}`}
                          >
                            {v.difficulty}
                          </span>
                        </div>

                        <h3 className="mt-2 font-display text-[1.18rem] leading-snug text-ink">
                          {v.title}
                        </h3>
                        <p className="mt-0.5 text-[12.5px] text-ink/55">{v.speaker}</p>
                        <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-ink/70">
                          {v.description}
                        </p>

                        <div className="mt-4 flex items-center justify-between gap-2 pt-1">
                          <span className="text-[13px] font-medium text-cobalt transition-transform duration-300 group-hover:translate-x-0.5">
                            Practice →
                          </span>
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* ── 30 Day Shadowing ────────────────────────────────────────── */}
          <div className="mt-14">
            <div className="mb-5 flex items-end justify-between gap-3">
              <h2 className="font-display text-[1.65rem] text-ink">30 Day Shadowing</h2>
              <p className="text-[11px] uppercase tracking-[0.18em] text-ink/40">
                Playlist
              </p>
            </div>

            <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {collections.map((c) => (
                <li
                  key={c.id}
                  className="group overflow-hidden rounded-2xl border border-ink/10 bg-[#fbf7ef] transition-transform duration-500 ease-out hover:-translate-y-0.5"
                >
                  <a
                    href={getPlaylistUrl(c)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex h-full flex-col"
                  >
                    <div className="relative aspect-[16/7] w-full overflow-hidden bg-ink/5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`https://i.ytimg.com/vi/${c.playlistId.replace(/^PL/, "EC")}/hqdefault.jpg`}
                        alt=""
                        className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-ink/30 to-transparent" />
                      <span className="absolute bottom-2 left-2 rounded-md bg-ink/85 px-2 py-0.5 text-[11px] uppercase tracking-[0.12em] text-ivory">
                        Playlist
                      </span>
                    </div>

                    <div className="flex flex-1 flex-col p-4">
                      <p className="text-[10.5px] uppercase tracking-[0.14em] text-ink/45">
                        {c.source}
                      </p>
                      <h3 className="mt-2 font-display text-[1.25rem] leading-snug text-ink">
                        {c.title}
                      </h3>
                      <p className="mt-2 text-[13px] leading-relaxed text-ink/70">
                        {c.description}
                      </p>
                      <div className="mt-4 flex items-center justify-between gap-2 pt-1">
                        <span className="text-[13px] font-medium text-cobalt transition-transform duration-300 group-hover:translate-x-0.5">
                          Open on YouTube →
                        </span>
                        <span className="text-[11px] text-ink/40">↗</span>
                      </div>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* ── Back link ──────────────────────────────────────────────── */}
          <div className="mt-16">
            <Link
              href="/"
              className="text-[11px] tracking-[0.18em] text-cobalt"
            >
              ‹ BACK TO HOME
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
