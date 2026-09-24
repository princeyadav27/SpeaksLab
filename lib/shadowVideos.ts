// Manually curated English speaking videos for shadowing practice.
// Only includes videos that are well-known, widely-used for English
// speaking practice, and hosted on stable YouTube channels.
//
// The 30 Day Shadowing playlist is stored as a single collection entry
// because we don't fetch YouTube API data — the user opens it on YouTube.

export type ShadowDifficulty = "easy" | "medium" | "hard";

export type ShadowVideo = {
  id: string;            // YouTube video ID
  title: string;
  speaker: string;       // speaker name or source channel
  source: string;        // e.g. "TED Talks", "BBC Learning English"
  durationLabel: string; // human-readable, e.g. "6:12"
  difficulty: ShadowDifficulty;
  description: string;
  // ISO 8601 duration if known (PT#M#S); otherwise empty string
  durationISO: string;
};

export type ShadowCollection = {
  id: "thirty-day-shadowing";
  type: "playlist";
  playlistId: string;
  title: string;
  source: string;
  description: string;
};

// Curated recommended videos.
// IDs are real, long-standing public videos commonly used for English
// speaking practice. The YouTube embed player is used directly — no
// local storage of video data.
const RECOMMENDED: ShadowVideo[] = [
  {
    id: "NVC1bh9C2ok",
    title: "The power of vulnerability",
    speaker: "Brené Brown",
    source: "TED",
    durationLabel: "20:02",
    durationISO: "PT20M2S",
    difficulty: "medium",
    description:
      "Warm, conversational delivery. A classic talk for practising natural rhythm and emphasis.",
  },
  {
    id: "iG9CE55wbtY",
    title: "Do schools kill creativity?",
    speaker: "Sir Ken Robinson",
    source: "TED",
    durationLabel: "19:23",
    durationISO: "PT19M23S",
    difficulty: "medium",
    description:
      "Lighter pace, strong storytelling. Good for practising clear sentence structure and humour.",
  },
  {
    id: "XUu0HhJpgwE",
    title: "The 6 principles to design for focus",
    speaker: "Jocelyn K. Glei",
    source: "TED",
    durationLabel: "12:53",
    durationISO: "PT12M53S",
    difficulty: "medium",
    description:
      "Compact, articulate delivery with clear transitions between ideas.",
  },
  {
    id: "wupToqz1e2g",
    title: "Grit: the power of passion and perseverance",
    speaker: "Angela Lee Duckworth",
    source: "TED",
    durationLabel: "6:13",
    durationISO: "PT6M13S",
    difficulty: "easy",
    description:
      "Short, clear and slow. An excellent first shadow for new speakers.",
  },
  {
    id: "1aA1WGON49E",
    title: "How great leaders inspire action",
    speaker: "Simon Sinek",
    source: "TED",
    durationLabel: "18:37",
    durationISO: "PT18M37S",
    difficulty: "hard",
    description:
      "Powerful rhetorical repetition. Practice emulating the rhythmic pattern.",
  },
  {
    id: "8jPQjjsBbIc",
    title: "How to learn any language in six months",
    speaker: "Chris Lonsdale",
    source: "TED",
    durationLabel: "10:47",
    durationISO: "PT10M47S",
    difficulty: "hard",
    description:
      "Fast, direct delivery. Good for stretching rhythm and word-level clarity.",
  },
];

const COLLECTIONS: ShadowCollection[] = [
  {
    id: "thirty-day-shadowing",
    type: "playlist",
    playlistId: "PLVZq1nyvT8ggskPJWk-wYgeF6KkZHgWrA",
    title: "30 Day Shadowing",
    source: "YouTube Playlist",
    description:
      "A 30-day English speaking programme on YouTube. Open the playlist and follow one video per day.",
  },
];

export function getRecommendedShadowVideos(): ShadowVideo[] {
  return RECOMMENDED;
}

export function getShadowCollections(): ShadowCollection[] {
  return COLLECTIONS;
}

export function getShadowVideoById(id: string): ShadowVideo | null {
  return RECOMMENDED.find((v) => v.id === id) ?? null;
}

export function extractYouTubeVideoId(input: string): string | null {
  try {
    const url = new URL(input.trim());
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    let videoId = "";

    if (hostname === "youtu.be") {
      videoId = url.pathname.split("/").filter(Boolean)[0] ?? "";
    } else if (
      hostname === "youtube.com" ||
      hostname === "m.youtube.com" ||
      hostname === "music.youtube.com" ||
      hostname === "youtube-nocookie.com"
    ) {
      if (url.pathname.replace(/\/$/, "") === "/watch") {
        videoId = url.searchParams.get("v") ?? "";
      } else if (url.pathname.startsWith("/shorts/") || url.pathname.startsWith("/embed/")) {
        videoId = url.pathname.split("/").filter(Boolean)[1] ?? "";
      }
    }

    return /^[A-Za-z0-9_-]{11}$/.test(videoId) ? videoId : null;
  } catch {
    return null;
  }
}

export function isYouTubeVideoId(value: string): boolean {
  return /^[A-Za-z0-9_-]{11}$/.test(value);
}

export function getYouTubeEmbedUrl(video: ShadowVideo): string {
  return `https://www.youtube.com/embed/${encodeURIComponent(video.id)}`;
}

export function getYouTubeWatchUrl(video: ShadowVideo): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`;
}

export function getPlaylistUrl(collection: ShadowCollection): string {
  return `https://www.youtube.com/playlist?list=${encodeURIComponent(collection.playlistId)}`;
}
