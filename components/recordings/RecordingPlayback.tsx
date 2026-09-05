"use client";

import { useEffect, useRef, useState } from "react";
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
  const [url, setUrl] = useState<string | null>(null);
  const lastUrlRef = useRef<string | null>(null);

  useEffect(() => {
    // Create a fresh URL when the recording id changes
    const next = URL.createObjectURL(recording.blob);
    lastUrlRef.current = next;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(next);

    return () => {
      if (lastUrlRef.current) {
        URL.revokeObjectURL(lastUrlRef.current);
        lastUrlRef.current = null;
      }
    };
  }, [recording.id, recording.blob]);

  if (!url) return null;

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
