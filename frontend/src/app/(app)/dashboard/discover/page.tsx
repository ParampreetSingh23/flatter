import type { Metadata } from "next";
import { Suspense } from "react";
import { Deck } from "@/components/matching/deck";
import { PageSpinner } from "@/components/spinner";
import { ApiFail } from "@/lib/api";
import type { DashboardData } from "@/lib/dashboard-types";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Discover — Flatter" };

export default function DiscoverPage() {
  return (
    <div className="mx-auto max-w-4xl lg:max-w-none">
      <Suspense fallback={<PageSpinner label="Loading discover" />}>
        <Content />
      </Suspense>
    </div>
  );
}

async function Content() {
  // Only the city (for the area filter); eligibility and people always come from the matching API.
  const d = await serverGet<DashboardData>("/api/dashboard").catch((e) => (e instanceof ApiFail ? null : null));
  return (
    <div className="grid gap-6 lg:gap-4">
      <div>
        <h1 className="text-[28px] font-bold leading-[1.2] tracking-[-1.2px] text-ink">Discover</h1>
        <p className="mt-3 text-muted">People whose answers fit yours, best fit first. Likes are private until you both like each other.</p>
      </div>
      <Deck cityId={d?.housing?.city?.id ?? null} />
    </div>
  );
}
