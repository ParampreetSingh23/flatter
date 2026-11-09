"use client";
import { useState } from "react";

// A broken or expired link degrades to a neutral tile with a local retry; it never breaks the profile.
export function FlatPhoto({ src, alt, className = "" }: { src: string | null; alt: string; className?: string }) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(!src);
  if (failed) {
    return (
      <div className={`flex flex-col items-center justify-center gap-2 rounded-lg bg-indigo/10 p-4 text-center text-sm text-muted ${className}`}>
        Photo unavailable
        {src && <button type="button" onClick={() => { setFailed(false); setAttempt((n) => n + 1); }} className="underline">Retry</button>}
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img key={attempt} src={src!} alt={alt} onError={() => setFailed(true)} className={`rounded-lg object-cover ${className}`} />;
}
