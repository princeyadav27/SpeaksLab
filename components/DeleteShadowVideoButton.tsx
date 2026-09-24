"use client";

import { useRouter } from "next/navigation";

const HIDDEN_VIDEOS_COOKIE = "speaklab-hidden-shadow-videos";

export default function DeleteShadowVideoButton({ videoId }: { videoId: string }) {
  const router = useRouter();

  function removeVideo() {
    const rawCookie = document.cookie
      .split("; ")
      .find((cookie) => cookie.startsWith(`${HIDDEN_VIDEOS_COOKIE}=`));
    const current = rawCookie?.slice(HIDDEN_VIDEOS_COOKIE.length + 1);
    let decoded = "";
    try {
      decoded = current ? decodeURIComponent(current) : "";
    } catch {
      decoded = "";
    }
    const hiddenIds = decoded.split(",").filter(Boolean);
    if (!hiddenIds.includes(videoId)) hiddenIds.push(videoId);
    document.cookie = `${HIDDEN_VIDEOS_COOKIE}=${encodeURIComponent(hiddenIds.join(","))}; path=/; max-age=31536000; samesite=lax`;
    router.push("/practice");
  }

  return (
    <button
      type="button"
      onClick={removeVideo}
      className="mt-4 inline-flex w-fit rounded-md border border-[#d77f7f]/45 px-3 py-2 text-[12px] text-[#9d4848] hover:bg-[#f8e6e6]"
    >
      Delete video
    </button>
  );
}
