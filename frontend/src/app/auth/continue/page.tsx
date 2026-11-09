import { auth } from "@clerk/nextjs/server";
import { Spinner } from "@/components/spinner";
import { SignOutButton } from "@clerk/nextjs";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { btnPrimary, btnSecondary } from "@/components/auth-controls";
import { ApiFail, api } from "@/lib/api";
import type { OnboardingState } from "@/lib/onboarding-types";

export default function Continue() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-surface-soft"><Spinner label="Getting things ready" className="size-14" /></main>}>
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
        <p className="mt-4 text-muted">{msg} This is a temporary problem, your answers are safe.</p>
        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link href="/auth/continue" className={btnPrimary}>Retry</Link>
          <SignOutButton redirectUrl="/route"><button className={btnSecondary}>Sign out</button></SignOutButton>
        </div>
      </Shell>
    );
  }
  redirect(state.onboardingCompletedAt ? "/dashboard" : `/onboarding?step=${state.nextStep}`);
}

function Shell({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-soft px-4 text-center text-ink">
      <div className="max-w-md">
        <h1 className="text-[28px] font-bold leading-[1.2] tracking-[-1.2px]">{title}</h1>
        {children}
      </div>
    </main>
  );
}
