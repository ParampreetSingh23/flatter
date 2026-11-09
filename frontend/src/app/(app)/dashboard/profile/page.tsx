import type { Metadata } from "next";
import { PageSpinner } from "@/components/spinner";
import Link from "next/link";
import { Suspense } from "react";
import { Card, cta } from "@/components/dashboard/blocks";
import { ProfileEditor } from "@/components/dashboard/profile-editor";
import { ApiFail } from "@/lib/api";
import type { MeData } from "@/lib/dashboard-types";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "My Profile — Flatter" };

export default function ProfilePage() {
  return (
    <div className="mx-auto max-w-4xl">
      <Suspense fallback={<PageSpinner label="Loading your profile" />}>
        <Content />
      </Suspense>
    </div>
  );
}

async function Content() {
  let me: MeData;
  try {
    me = await serverGet<MeData>("/api/profile/me");
  } catch (e) {
    return (
      <Card>
        <h1 className="text-[2rem] font-black leading-none text-electric">We couldn&apos;t load your profile.</h1>
        <p className="mt-4">{e instanceof ApiFail ? e.message : "Something went wrong."} Your data is safe.</p>
        <Link href="/dashboard/profile" className={`${cta} mt-6`}>Retry</Link>
      </Card>
    );
  }
  return <ProfileEditor initial={me} />;
}
