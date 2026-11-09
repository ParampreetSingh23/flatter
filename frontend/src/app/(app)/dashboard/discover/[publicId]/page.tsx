import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Card, cta } from "@/components/dashboard/blocks";
import { BackToDiscover, DiscoveryDetailView } from "@/components/matching/detail-view";
import { RetryButton } from "@/components/matching/retry-button";
import { ViewerSafety } from "@/components/matching/viewer-safety";
import { PageSpinner } from "@/components/spinner";
import { ApiFail } from "@/lib/api";
import { discoverHref, safeQueryFrom } from "@/lib/discovery-filters";
import type { DiscoveryDetail } from "@/lib/matching-types";
import { serverGet } from "@/lib/server-api";
import Link from "next/link";

export const metadata: Metadata = { title: "Profile details — Flatter", robots: { index: false } };

type Props = { params: Promise<{ publicId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function DiscoveryDetailPage({ params, searchParams }: Props) {
  return (
    <div className="mx-auto max-w-4xl lg:max-w-none">
      <Suspense fallback={<PageSpinner label="Loading details" />}>
        <Content params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Content({ params, searchParams }: Props) {
  const { publicId } = await params;
  const qs = safeQueryFrom(await searchParams); // allowlisted filters only; never an arbitrary return URL
  let d: DiscoveryDetail;
  try {
    // Fresh and authenticated every time: the API re-checks eligibility, visibility and blocks.
    d = await serverGet<DiscoveryDetail>(`/api/discovery/${encodeURIComponent(publicId)}`);
  } catch (e) {
    const f = e instanceof ApiFail ? e : null;
    if (f?.code === "NOT_ELIGIBLE") redirect("/auth/continue");
    const setup = f && ["NOT_ENROLLED", "MATCHING_NOT_READY"].includes(f.code);
    // Unavailable and blocked look identical on purpose: no reason is given for someone else's exclusion.
    const gone = f?.status === 404;
    const heading = gone ? "This person is no longer available"
      : setup ? "Finish your matching preferences"
      : f?.code === "NO_ELIGIBLE_FLAT" ? "Publish your flat first"
      : f?.status === 0 ? "You seem to be offline" : "We couldn't load these details";
    return (
      <div className="grid gap-6 lg:gap-4">
        <div><BackToDiscover qs={qs} /></div>
        <Card>
          <h1 role="alert" className="text-[28px] font-bold leading-[1.2] tracking-[-1.2px] text-ink">{heading}</h1>
          <p className="mt-4 text-muted">{gone ? "They may have changed their settings, or you may no longer see each other. Go back to keep discovering." : f?.message ?? "Something went wrong."}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            {setup && <Link href="/dashboard/matching" className={cta}>Set up matching</Link>}
            {f?.code === "NO_ELIGIBLE_FLAT" && <Link href="/dashboard/listing" className={cta}>Go to my listing</Link>}
            {!gone && !setup && f?.code !== "NO_ELIGIBLE_FLAT" && <RetryButton />}
          </div>
        </Card>
      </div>
    );
  }
  return (
    <DiscoveryDetailView d={d} qs={qs} footer={
      // A successful block returns to Discover, which refetches current eligibility.
      <ViewerSafety publicId={publicId} name={d.displayName ?? "this person"} afterBlock={discoverHref(qs)} />
    } />
  );
}
