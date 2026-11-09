import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card, cta } from "@/components/dashboard/blocks";
import { MatchingPrefs } from "@/components/matching/preferences";
import { PageSpinner } from "@/components/spinner";
import { ApiFail } from "@/lib/api";
import type { MeData } from "@/lib/dashboard-types";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Matching preferences — Flatter" };

export default function MatchingPage() {
  return (
    <Suspense fallback={<PageSpinner label="Loading matching preferences" />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  let me: MeData;
  try {
    me = await serverGet<MeData>("/api/profile/me");
  } catch (e) {
    return (
      <Card>
        <h1 className="text-[28px] font-bold leading-[1.2] tracking-[-1.2px] text-ink">We couldn&apos;t load this page.</h1>
        <p className="mt-4">{e instanceof ApiFail ? e.message : "Something went wrong."}</p>
        <Link href="/dashboard/matching" className={`${cta} mt-6`}>Retry</Link>
      </Card>
    );
  }
  return <MatchingPrefs initial={me} />;
}
