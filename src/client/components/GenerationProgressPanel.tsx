import { useEffect, useState } from "react";
import type { GenerationProgress } from "../hooks/useGameStore";

export default function GenerationProgressPanel({ progress }: { progress: GenerationProgress }) {
  const [localElapsedMs, setLocalElapsedMs] = useState(progress.elapsedMs);

  useEffect(() => {
    const startedAt = Date.now() - progress.elapsedMs;
    setLocalElapsedMs(progress.elapsedMs);
    const interval = window.setInterval(() => {
      setLocalElapsedMs(Date.now() - startedAt);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [progress.stage]);

  const elapsedSeconds = Math.max(Math.floor(localElapsedMs / 1000), Math.floor(progress.elapsedMs / 1000));

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3" aria-live="polite">
      <div className="flex items-center justify-between gap-4 text-sm">
        <span>{progress.message}</span>
        <span className="shrink-0 text-muted-foreground">
          {Math.floor(elapsedSeconds / 60)}:{String(elapsedSeconds % 60).padStart(2, "0")}
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.progress}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500"
          style={{ width: `${progress.progress}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        The generator is still working while this timer advances. Quality checks may take several minutes.
      </p>
    </div>
  );
}
