import { auth } from "@clerk/nextjs/server";
import { SignOutButton } from "@clerk/nextjs";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { btnPrimary, btnSecondary } from "@/components/auth-controls";
import { ApiFail, api } from "@/lib/api";
import type { OnboardingState } from "@/lib/onboarding-types";

export default function Continue() {
  return (
    <Suspense fallback={<Shell title="Getting things ready…" />}>
      <Decide />
    </Suspense>
  );
}

// Completion authority is the database (via Express), never Clerk metadata.
async function Decide() {
  let state: OnboardingState;
  try {
    state = await api<OnboardingState>(await (await auth()).getToken(), "GET", "/api/onboarding");
  } catch (e) {
    const msg = e instanceof ApiFail ? e.message : "Something went wrong.";
    return (
      <Shell title="We couldn't load your profile.">
        <p className="mt-4 text-white/90">{msg} This is a temporary problem, your answers are safe.</p>
        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link href="/auth/continue" className={btnPrimary}>Retry</Link>
          <SignOutButton redirectUrl="/route"><button className={btnSecondary}>Sign out</button></SignOutButton>
        </div>
      </Shell>
    );
  }
  redirect(state.onboardingCompletedAt ? "/route" : `/onboarding?step=${state.nextStep}`);
}

function Shell({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <main className="grain flex min-h-screen items-center justify-center px-4 text-center text-white">
      <div className="max-w-md">
        <h1 className="text-[2rem] font-black leading-none tracking-[-0.02em]">{title}</h1>
        {children}
      </div>
    </main>
  );
}
