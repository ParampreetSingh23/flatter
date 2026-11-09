import type { Metadata } from "next";
import { PageSpinner } from "@/components/spinner";
import Link from "next/link";
import { Suspense } from "react";
import { Card, cta, ghost, HOME, HousingBlock, ListingBlock } from "@/components/dashboard/blocks";
import { Icon } from "@/components/icons";
import { Initials } from "@/components/onboarding/fields";
import { ApiFail } from "@/lib/api";
import type { DashboardData } from "@/lib/dashboard-types";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Dashboard — Flatter" };

export default function Dashboard() {
  return (
    <Suspense fallback={<PageSpinner label="Loading your dashboard" />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  let d: DashboardData;
  try {
    d = await serverGet<DashboardData>("/api/dashboard");
  } catch (e) {
    const recovery = e instanceof ApiFail && e.code === "PROFILE_INCOMPLETE";
    return (
      <Card>
        <h1 className="text-[28px] font-bold leading-[1.2] tracking-[-1.2px] text-ink">{recovery ? "We found a problem with your profile." : "We couldn't load your dashboard."}</h1>
        <p className="mt-4">{e instanceof ApiFail ? e.message : "Something went wrong."}{!recovery && " This is temporary."}</p>
        {!recovery && <Link href="/dashboard" className={`${cta} mt-6`}>Retry</Link>}
      </Card>
    );
  }
  const home = HOME[d.intent];
  const name = d.profile.displayName;
  return (
    <div className="grid gap-6 lg:gap-4">
      <section className="overflow-hidden rounded-2xl bg-surface-card text-ink">
        <div className="flex items-center justify-between gap-6 p-6 sm:p-8 lg:p-5">
          <div className="max-w-2xl">
            <p className="text-lg lg:text-sm">Hi{name ? `, ${name}` : ""}. Your profile is ready.</p>
            <h1 className="mt-3 text-[28px] font-bold leading-[1.2] tracking-[-1.2px] lg:mt-1">{home.heading}</h1>
            <p className="mt-4 text-lg opacity-90 lg:mt-2 lg:text-base">{home.blurb}</p>
          </div>
          <Icon name={d.intent === "HAVE_ROOM" ? "home" : d.intent === "TEAM_UP" ? "users" : "search"} className="hidden size-12 stroke-[1.25] text-muted lg:block" />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2 lg:gap-4">
        {d.intent === "HAVE_ROOM" && <div className="lg:order-1 lg:col-span-2"><ListingBlock data={d} /></div>}
        <div className="grid lg:order-3">
          <HousingBlock housing={d.housing} intent={d.intent} />
        </div>

        <Card title="Your profile" id="profile-h" icon="user" className="lg:order-2 lg:col-span-2 lg:grid lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center lg:gap-6">
          <div className="mt-4 flex items-center gap-4 lg:mt-0">
            {d.profile.avatarUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={d.profile.avatarUrl} alt="Your profile photo" className="size-16 rounded-full object-cover lg:size-10" />
              : <Initials name={name ?? ""} className="size-16 lg:size-10" />}
            <div>
              <p className="font-bold">{name}</p>
              <p className="text-sm text-muted">{d.discoveryEnabled ? "Visible to other signed-in users" : "Not visible to other users yet"}</p>
            </div>
          </div>
          <Link href="/dashboard/profile" className={`${ghost} mt-4 lg:mt-0`}>View My Profile</Link>
        </Card>

        <Card title="Find your match" id="match-h" icon="heart" className="lg:order-4">
          <p className="mt-4 text-sm text-muted">{d.matching.enrolled && d.matching.ready ? "Meet people whose answers fit yours." : "Answer a few last questions, then start meeting people."}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {d.features.discovery === "available" && (
              <Link href={d.matching.enrolled && d.matching.ready ? "/dashboard/discover" : "/dashboard/matching"} className={cta}>
                {d.matching.enrolled && d.matching.ready ? "Discover people" : "Set up matching"}
              </Link>
            )}
            <Link href="/dashboard/matches" className={ghost}>Your matches</Link>
            {d.matching.enrolled && <Link href="/dashboard/matching" className={ghost}>Matching preferences</Link>}
          </div>
        </Card>
      </div>
    </div>
  );
}
