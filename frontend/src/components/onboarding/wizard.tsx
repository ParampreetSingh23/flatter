"use client";
import { SignOutButton, useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/logo";
import { PageSpinner } from "@/components/spinner";
import { ApiFail, api } from "@/lib/api";
import { STEPS, type OnboardingState, type Step } from "@/lib/onboarding-types";
import { btnNext, type Errors } from "./fields";
import { AboutStep, FlatmateStep, HousingStep, IntentStep, LifestyleStep, ReviewStep, type StepProps } from "./steps";

const TITLES: Record<Step, [string, string?]> = {
  intent: ["What are you looking for?", "We'll personalize your experience based on what you need."],
  about: ["Tell us about yourself."],
  housing: ["Where would you like to live?"],
  lifestyle: ["What is living with you like?", "Honest answers help us find compatible people. No habit is better than another."],
  flatmate: ["What works for you in a flatmate?", "Your preferences can be different from your own habits."],
  review: ["Ready to find your people?"],
};
const COMPONENTS: Record<Step, (p: StepProps) => React.ReactNode> = {
  intent: IntentStep, about: AboutStep, housing: HousingStep, lifestyle: LifestyleStep, flatmate: FlatmateStep, review: ReviewStep,
};

type Banner = { kind: "error" | "conflict" | "auth"; text: string; links?: string[] };

export function Wizard() {
  const { getToken, isLoaded } = useAuth();
  const router = useRouter();
  const requested = useSearchParams().get("step");
  const [state, setState] = useState<OnboardingState | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  // Errors belong to the step they came from, so they vanish on navigation without an effect.
  const [fail, setFail] = useState<{ step: Step; errors: Errors; banner: Banner } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isLoaded) return;
    let off = false;
    getToken()
      .then((t) => api<OnboardingState>(t, "GET", "/api/onboarding"))
      .then((st) => !off && setState(st))
      .catch((e) => !off && setLoadErr(e instanceof ApiFail ? e.message : "Something went wrong."));
    return () => { off = true; };
  }, [isLoaded, getToken, attempt]);
  const load = () => { setLoadErr(null); setFail(null); setAttempt((n) => n + 1); };

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  // The server decides which steps are reachable; the URL only requests one.
  const firstInvalid = state ? STEPS.findIndex((s) => s !== "review" && !state.stepValidity[s as keyof OnboardingState["stepValidity"]]) : 0;
  const maxIdx = firstInvalid === -1 ? STEPS.length - 1 : firstInvalid;
  const reqIdx = Math.max(0, STEPS.indexOf(requested as Step));
  const idx = Math.min(reqIdx, maxIdx);
  const step = STEPS[idx]!;

  useEffect(() => { if (state?.onboardingCompletedAt) router.replace("/dashboard"); }, [state, router]);
  useEffect(() => { if (state && !state.onboardingCompletedAt && (requested !== step)) router.replace(`/onboarding?step=${step}`); }, [state, requested, step, router]);
  useEffect(() => { heading.current?.focus(); }, [step]);
  useEffect(() => { if (fail) alertRef.current?.focus(); }, [fail]);
  const errors = fail?.step === step ? fail.errors : {};
  const banner = fail?.step === step ? fail.banner : null;
  const setBanner = (b: Banner, errs: Errors = {}) => setFail({ step, errors: errs, banner: b });

  async function submit(path: string, body: Record<string, unknown>) {
    if (!state || busy) return;
    setBusy(true); setFail(null);
    try {
      const next = await api<OnboardingState>(await getToken(), path === "/complete" ? "POST" : "PATCH", `/api/onboarding${path}`, { revision: state.revision, ...body });
      setState(next); setDirty(false);
      router.push(path === "/complete" ? "/dashboard" : `/onboarding?step=${STEPS[idx + 1]}`);
    } catch (e) {
      if (!(e instanceof ApiFail)) return void setBanner({ kind: "error", text: "Something went wrong. Your answers are kept. Please retry." });
      if (e.status === 401) setBanner({ kind: "auth", text: "Your session has expired. Sign in again to continue; your saved answers will be there." });
      else if (e.status === 409) setBanner({ kind: "conflict", text: e.code === "ONBOARDING_ALREADY_COMPLETE" ? "Your onboarding is already complete." : "These answers were changed in another tab or device. Reload the saved answers, review, then continue." });
      else if (e.status === 403) setBanner({ kind: "error", text: e.message });
      else if (e.status === 422 && path === "/complete") setBanner({ kind: "error", text: "Some sections need attention before you can finish.", links: Object.keys(e.fields) });
      else if (e.status === 422) setBanner({ kind: "error", text: "Please fix the highlighted answers." }, e.fields);
      else setBanner({ kind: "error", text: e.message });
    } finally {
      setBusy(false);
    }
  }

  const Body = COMPONENTS[step];
  const [title, sub] = state?.housingIntent === "HAVE_ROOM" && step === "housing" ? ["Tell us where your flat is."] : TITLES[step];

  return (
    <>
      <header className="grain">
        <div className="mx-auto flex h-20 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <SignOutButton redirectUrl="/route">
            <button className="rounded-xl px-4 py-3 font-mono text-xs font-bold uppercase tracking-wider text-white hover:bg-indigo">Sign out</button>
          </SignOutButton>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        {loadErr ? (
          <div role="alert" className="rounded-xl bg-white p-6">
            <h1 className="text-2xl font-black">We couldn&apos;t load your profile.</h1>
            <p className="mt-2">{loadErr} Your answers are safe.</p>
            <button onClick={load} className={`${btnNext} mt-6`}>Retry</button>
          </div>
        ) : !state ? (
          <PageSpinner label="Loading your answers" />
        ) : (
          <>
            <p className="font-mono text-xs font-bold uppercase tracking-wider text-muted">Step {idx + 1} of {STEPS.length}</p>
            <div role="progressbar" aria-label="Onboarding progress" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={idx + 1} className="mt-2 h-2 rounded-full bg-indigo/15">
              <div className="h-2 rounded-full bg-electric" style={{ width: `${((idx + 1) / STEPS.length) * 100}%` }} />
            </div>
            <h1 ref={heading} tabIndex={-1} className="mt-8 text-[2rem] font-black leading-none tracking-[-0.02em] text-electric sm:text-[2.5rem]">{title}</h1>
            {sub && <p className="mt-4 text-muted">{sub}</p>}

            {banner && (
              <div ref={alertRef} role="alert" tabIndex={-1} className="mt-6 rounded-xl border-2 border-red-700 bg-white p-4">
                <p className="font-bold text-red-700">{banner.text}</p>
                {Object.keys(errors).length > 0 && <ul className="mt-2 list-disc pl-5 text-sm">{Object.entries(errors).map(([k, v]) => <li key={k}>{v}</li>)}</ul>}
                {banner.links && <ul className="mt-2 list-disc pl-5 text-sm">{banner.links.map((s) => <li key={s}><Link href={`/onboarding?step=${s}`} className="underline">Edit {s}</Link></li>)}</ul>}
                {banner.kind === "conflict" && <button onClick={load} className={`${btnNext} mt-4`}>Reload saved answers</button>}
                {banner.kind === "auth" && <Link href="/auth/continue" className={`${btnNext} mt-4`}>Sign in again</Link>}
              </div>
            )}

            <div className="mt-8" onChange={() => setDirty(true)} aria-busy={busy}>
              <Body key={step} state={state} errors={errors} busy={busy} submit={submit} {...(idx > 0 && { back: () => router.push(`/onboarding?step=${STEPS[idx - 1]}`) })} />
            </div>
            <p className="sr-only" role="status" aria-live="polite">{busy ? "Saving" : ""}</p>
          </>
        )}
      </main>
    </>
  );
}
