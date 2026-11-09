import type { Metadata } from "next";
import { PageSpinner } from "@/components/spinner";
import Link from "next/link";
import { Suspense } from "react";
import { Card, ComingSoon, cta, HOME, HousingBlock, ListingBlock } from "@/components/dashboard/blocks";
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
        <h1 className="text-[2rem] font-black leading-none text-electric">{recovery ? "We found a problem with your profile." : "We couldn't load your dashboard."}</h1>
        <p className="mt-4">{e instanceof ApiFail ? e.message : "Something went wrong."}{!recovery && " This is temporary."}</p>
        {!recovery && <Link href="/dashboard" className={`${cta} mt-6`}>Retry</Link>}
      </Card>
    );
  }
  const home = HOME[d.intent];
  const name = d.profile.displayName;
  return (
    <div className="grid gap-6">
      <section className="grain overflow-hidden rounded-3xl text-white">
        <div className="flex items-center justify-between gap-8 p-6 sm:p-10">
          <div className="max-w-2xl">
            <p className="text-lg">Hi{name ? `, ${name}` : ""}. Your profile is ready.</p>
            <h1 className="mt-3 text-[2rem] font-black leading-none tracking-[-0.02em] sm:text-[2.5rem] lg:text-[3rem]">{home.heading}</h1>
            <p className="mt-4 text-lg opacity-90">{home.blurb}</p>
          </div>
          <Icon name={d.intent === "HAVE_ROOM" ? "home" : d.intent === "TEAM_UP" ? "users" : "search"} className="hidden size-40 stroke-[1.25] text-white/25 lg:block" />
        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="grid gap-6 lg:col-span-2">
          {d.intent === "HAVE_ROOM" && <ListingBlock data={d} />}
          <HousingBlock housing={d.housing} intent={d.intent} />
        </div>

        <div className="grid gap-6">
          <Card title="Your profile" id="profile-h" icon="user">
            <div className="mt-4 flex flex-col items-start gap-4">
              {d.profile.avatarUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={d.profile.avatarUrl} alt="Your profile photo" className="size-16 rounded-full object-cover" />
                : <Initials name={name ?? ""} />}
              <div>
                <p className="font-bold">{name}</p>
                <p className="text-sm text-muted">{d.discoveryEnabled ? "Visible to other signed-in users" : "Not visible to other users yet"}</p>
              </div>
              <Link href="/dashboard/profile" className={cta}>View My Profile</Link>
            </div>
          </Card>

          <Card title="Coming soon" id="soon-h" icon="clock">
            <div className="mt-4 grid gap-3">{home.soon.map((s) => <ComingSoon key={s} label={s} />)}</div>
          </Card>
        </div>
      </div>
    </div>
  );
}
