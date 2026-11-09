"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { cta } from "../dashboard/blocks";

// Re-requests the current server-rendered page (fresh, authenticated data). No decision is ever sent.
export function RetryButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return <button type="button" disabled={pending} onClick={() => start(() => router.refresh())} className={cta}>{pending ? "Retrying…" : "Retry"}</button>;
}
