import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card, cta } from "@/components/dashboard/blocks";
import { MatchesList } from "@/components/matching/matches";
import { PageSpinner } from "@/components/spinner";
import { ApiFail } from "@/lib/api";
import type { MatchItem } from "@/lib/matching-types";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Matches — Flatter" };

export default function MatchesPage() {
  return (
    <div className="mx-auto max-w-4xl lg:max-w-none">
      <Suspense fallback={<PageSpinner label="Loading matches" />}>
        <Content />
      </Suspense>
    </div>
  );
}

async function Content() {
  let m: { matches: MatchItem[] }, b: { blocks: { publicId: string; displayName: string | null; avatarUrl: string | null }[] };
  try {
    [m, b] = await Promise.all([serverGet<typeof m>("/api/matches"), serverGet<typeof b>("/api/blocks")]);
  } catch (e) {
    return (
      <Card>
        <h1 className="text-[28px] font-bold leading-[1.2] tracking-[-1.2px] text-ink">We couldn&apos;t load your matches.</h1>
        <p className="mt-4">{e instanceof ApiFail ? e.message : "Something went wrong."}</p>
        <Link href="/dashboard/matches" className={`${cta} mt-6`}>Retry</Link>
      </Card>
    );
  }
  return <MatchesList initial={m.matches} blocked={b.blocks} />;
}
