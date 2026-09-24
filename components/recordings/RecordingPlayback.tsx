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
  // The object URL is kept together with the blob it was created from. Media
  // is loaded lazily on the My Recordings page, so right after switching
  // recordings the previous (already revoked) URL must not be rendered for the
  // next recording; that briefly pointed the player at a dead blob: URL.
  const [source, setSource] = useState<{ blob: Blob; url: string } | null>(null);

  useEffect(() => {
    if (!recording.blob) return;
    // Create a fresh URL when the recording id changes
    const blob = recording.blob;
    const next = URL.createObjectURL(blob);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSource({ blob, url: next });

    return () => {
      URL.revokeObjectURL(next);
    };
  }, [recording.id, recording.blob]);

  const url = recording.blob && source?.blob === recording.blob ? source.url : null;
  if (!recording.blob || !url) return null;

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
