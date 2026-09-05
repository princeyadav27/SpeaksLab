"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { extractYouTubeVideoId } from "@/lib/shadowVideos";

export default function CustomYouTubeVideoForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const videoId = extractYouTubeVideoId(url);
    if (!videoId) {
      setError("Enter a valid YouTube video URL, such as youtube.com/watch?v=... or youtu.be/...");
      return;
    }
    setError(null);
    router.push(`/practice/shadow/${videoId}`);
  }

  return (
    <section className="mt-10 rounded-2xl border border-cobalt/15 bg-[#eef1fa] p-5 sm:p-6">
      <div className="flex flex-col gap-1">
        <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-cobalt">YOUR VIDEO</p>
        <h2 className="font-display text-[1.45rem] text-ink">Add a YouTube video</h2>
        <p className="text-[13px] leading-relaxed text-ink/60">Paste a video link to practice with it immediately. The video stays on YouTube.</p>
      </div>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="custom-youtube-url">YouTube video URL</label>
        <input
          id="custom-youtube-url"
          value={url}
          onChange={(event) => { setUrl(event.target.value); setError(null); }}
          placeholder="Paste a YouTube URL..."
          className="min-w-0 flex-1 rounded-xl border border-ink/10 bg-[#fbf7ef] px-3.5 py-2.5 text-[13px] text-ink outline-none placeholder:text-ink/40 focus:border-cobalt/40"
        />
        <button type="submit" className="rounded-xl bg-cobalt px-5 py-2.5 text-[13px] font-medium text-ivory hover:bg-cobalt-deep">Practice Video</button>
      </form>
      {error ? <p role="alert" className="mt-2 text-[12px] text-[#9d4848]">{error}</p> : null}
    </section>
  );
}