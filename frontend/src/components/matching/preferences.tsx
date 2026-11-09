"use client";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiFail, api } from "@/lib/api";
import type { MeData } from "@/lib/dashboard-types";
import { WORK } from "@/lib/onboarding-types";
import { Card, ghost } from "../dashboard/blocks";
import { btnNext, CheckGroup, Field, inputCls, RadioCards, type Errors } from "../onboarding/fields";

const MISSING: Record<string, string> = {
  gender: "gender", sleep: "your sleep schedule", cleanliness: "tidiness", food: "food habits", smoking: "smoking", guests: "guests", pets: "pets",
  acceptedGenders: "which genders you'd live with", city: "your city", budget: "your budget", locations: "your areas",
};

export function MatchingPrefs({ initial }: { initial: MeData }) {
  const { getToken } = useAuth();
  const router = useRouter();
  const [data, setData] = useState(initial);
  const owner = data.intent === "HAVE_ROOM";
  const m = data.matching, h = data.housing;
  const [work, setWork] = useState<string | null>(m.workStudySchedule);
  const [accepted, setAccepted] = useState<string[]>(m.acceptedWorkStudySchedules);
  const [flex, setFlex] = useState<boolean>(h?.moveInFlexible ?? false);
  const [from, setFrom] = useState(h?.moveInDate ?? "");
  const [to, setTo] = useState(h?.moveInLatestDate ?? "");
  const [on, setOn] = useState(true);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const profileGaps = m.missing.filter((k) => MISSING[k]).map((k) => MISSING[k]);

  async function save() {
    setBusy(true); setMsg(""); setErrors({});
    const e: Errors = {};
    if (!work) e.workStudySchedule = "Choose your routine";
    if (!accepted.length) e.acceptedWorkStudySchedules = "Choose at least one routine you're fine with";
    if (Object.keys(e).length) { setErrors(e); setBusy(false); return; }
    try {
      const next = await api<MeData>(await getToken(), "PATCH", "/api/profile/me/matching", {
        version: data.version, workStudySchedule: work, acceptedWorkStudySchedules: accepted, enrolled: on,
        ...(!owner && { moveInFlexible: flex, moveInDate: flex ? null : from || null, moveInLatestDate: flex ? null : to || null }),
      });
      setData(next);
      if (on && next.matching.ready) router.push("/dashboard/discover");
      else setMsg(on ? "Saved, but some answers are still missing." : "Saved. Matching is off.");
    } catch (err) {
      const f = err instanceof ApiFail ? err : null;
      setErrors(f?.fields ?? {});
      setMsg(f?.code === "VERSION_CONFLICT" ? "Your profile changed in another tab. Reload this page, then save again." : f?.message ?? "Couldn't save. Try again.");
    } finally { setBusy(false); }
  }

  return (
    <div className="grid gap-6 lg:gap-4">
      <div>
        <h1 className="text-[28px] font-bold leading-[1.2] tracking-[-1.2px] text-ink">Matching preferences</h1>
        <p className="mt-3 text-muted">A few last answers before you meet people. Your profile and onboarding stay as they are.</p>
      </div>

      {profileGaps.length > 0 && (
        <div role="alert" className="rounded-2xl border border-error bg-white p-4">
          <p className="font-bold text-error">Finish these in My Profile first: {profileGaps.join(", ")}.</p>
          <Link href="/dashboard/profile" className={`${ghost} mt-3`}>Open My Profile</Link>
        </div>
      )}

      <Card title="How you work or study" id="work-h" icon="clock">
        <div className="mt-4 grid gap-6 lg:gap-4">
          <RadioCards name="workStudySchedule" legend="Your usual routine" options={WORK} value={work} onChange={setWork} errors={errors} />
          <CheckGroup name="acceptedWorkStudySchedules" legend="Routines you're fine living with" options={WORK} value={accepted} onChange={setAccepted} errors={errors} anyLabel="Any routine is fine" />
        </div>
      </Card>

      {owner ? (
        <Card title="Your flat" id="flat-h" icon="home">
          <p className="mt-4 text-sm text-muted">Rent, area and availability come from your published flat. Publish it with at least one available place to appear in Discover.</p>
          <Link href="/dashboard/listing" className={`${ghost} mt-4`}>Go to my listing</Link>
        </Card>
      ) : (
        <Card title="When you can move" id="move-h" icon="calendar">
          <div className="mt-4 grid gap-6 lg:gap-4">
            <label className="flex items-center gap-3">
              <input type="checkbox" checked={flex} onChange={(e) => setFlex(e.target.checked)} className="size-4 accent-ink" />
              <span className="font-bold">I&apos;m flexible on timing</span>
            </label>
            {!flex && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field name="moveInDate" label="Earliest move-in" errors={errors}><input id="moveInDate" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} /></Field>
                <Field name="moveInLatestDate" label="Latest move-in" hint="Use the same date for one exact day." errors={errors}><input id="moveInLatestDate" type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} /></Field>
              </div>
            )}
          </div>
        </Card>
      )}

      <Card title="Before you turn matching on" id="consent-h" icon="shield">
        <ul className="mt-4 grid list-disc gap-2 pl-5 text-sm">
          <li><span className="font-bold">Other people who are matching can see</span> your name, age, occupation, bio, photo, city, areas, budget, move-in timing, habits and work or study routine. Never your date of birth or contact details.</li>
          <li><span className="font-bold">What you accept is firm.</span> The food, sleep, smoking, guest, tidiness, work and gender choices you accept in My Profile decide who you see and who sees you. Nobody is shown a reason.</li>
          <li><span className="font-bold">A compatibility score</span> compares your answers. It isn&apos;t a safety check or a promise of a good fit.</li>
          <li>You can turn matching off any time. Existing matches stay until you unmatch or block.</li>
        </ul>
        <label className="mt-4 flex items-start gap-3 rounded-2xl border border-hairline p-4 has-checked:border-ink has-checked:bg-surface-card">
          <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} className="mt-1 size-4 accent-ink" />
          <span><span className="block font-bold">Turn on matching and show me to other people</span><span className="block text-sm text-muted">You can change this later.</span></span>
        </label>
      </Card>

      {msg && <p role="alert" className="text-sm font-bold text-error">{msg}</p>}
      <div><button type="button" disabled={busy} onClick={() => void save()} className={btnNext}>{busy ? "Saving…" : on ? "Save and start matching" : "Save"}</button></div>
    </div>
  );
}
