"use client";

import { useEffect, useState } from "react";
import type { SavedRecording } from "@/lib/recordingsDb";

/**
 * Renders the saved recording's blob as an inline media player.
 *
 * Owns the lifecycle of its own `URL.createObjectURL` reference: the URL is
 * created once on mount (or whenever the recording id changes), and revoked
 * only on unmount/id change. This stops the re-creating-and-loading bug
 * that happened when the URL was created inline during render.
 */
export default function RecordingPlayback({
  recording,
  className,
  showControls = true,
}: {
  recording: SavedRecording;
  className?: string;
  showControls?: boolean;
}) {
  // The object URL is kept together with the blob it was created from, so a
  // URL is only ever rendered for its own blob. My Recordings reuses this
  // component across recordings and loads media lazily; a URL left over from
  // the previous recording has already been revoked (dead blob: URL).
  const [source, setSource] = useState<{ blob: Blob; url: string } | null>(null);

  useEffect(() => {
    if (!recording.blob) {
      // Forget the previous recording's URL (revoked by the cleanup below)
      // so it cannot be shown again when that recording is re-selected.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSource(null);
      return;
    }
    // Create a fresh URL when the recording id changes
    const blob = recording.blob;
    const next = URL.createObjectURL(blob);
    setSource({ blob, url: next });

    return () => {
      URL.revokeObjectURL(next);
    };
  }, [recording.id, recording.blob]);

  if (!recording.blob) return null;
  const url = source?.blob === recording.blob ? source.url : null;
  // This blob's URL is created right after this render. Keep the player's
  // box in place meanwhile so the page layout does not jump for a frame.
  if (!url) return <div className={className} aria-hidden="true" />;

  const isVideo = recording.blob.type.startsWith("video/");
  if (isVideo) {
    return (
      <video
        src={url}
        controls={showControls}
        playsInline
        preload="metadata"
        className={className}
      />
    );
  }
  return (
    <audio
      src={url}
      controls={showControls}
      preload="metadata"
      className={className}
    />
  );
}
