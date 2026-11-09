"use client";
import { useAuth, useClerk } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ApiFail, api } from "@/lib/api";
import { INTENT_LABEL, type MeData } from "@/lib/dashboard-types";
import { inr } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/listing-types";
import { CLEAN, FOOD, FLATMATE_GENDERS, GENDERS, GUESTS, label, OCCUPATIONS, PETS, SLEEP, SMOKE, type Opt } from "@/lib/onboarding-types";
import { Avatar, AvatarPicker, btnBack, btnNext, Field, Initials, inputCls, RadioCards, type Errors, type PhotoAction } from "../onboarding/fields";
import { Card, cta, ghost } from "./blocks";
import { FlatmateStep, HousingStep, LifestyleStep } from "../onboarding/steps";
import type { OnboardingState } from "@/lib/onboarding-types";

const list = (opts: Opt[], vals: string[] | undefined) => (vals?.length ? vals.map((v) => label(opts, v)).join(", ") : "—");
const Rows = ({ rows }: { rows: [string, string][] }) => (
  <dl className="mt-3 grid gap-2 text-sm">
    {rows.map(([k, v]) => <div key={k} className="grid gap-1 sm:grid-cols-[12rem_1fr]"><dt className="text-muted">{k}</dt><dd>{v}</dd></div>)}
  </dl>
);

export function ProfileEditor({ initial }: { initial: MeData }) {
  const { getToken } = useAuth();
  const { openUserProfile } = useClerk();
  const [data, setData] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [section, setSection] = useState<Section | null>(null);
  const [note, setNote] = useState<{ kind: "ok" | "error" | "conflict"; text: string } | null>(null);
  const p = data.profile;

  async function reload() {
    try {
      setData(await api<MeData>(await getToken(), "GET", "/api/profile/me"));
      setNote({ kind: "ok", text: "Reloaded your saved profile." });
    } catch {
      setNote({ kind: "error", text: "Couldn't reload. Please retry." });
    }
  }
  const h = data.housing, l = data.lifestyle, f = data.flatmate;
  const busyElsewhere = editing || section !== null;
  const editBtn = (sec: Section, what: string) => (
    <button type="button" disabled={busyElsewhere} onClick={() => { setNote(null); setSection(sec); }} className="font-mono text-xs font-bold uppercase tracking-wider text-electric underline disabled:opacity-40">Edit<span className="sr-only"> {what}</span></button>
  );
  const sectionEditor = (sec: Section) => (
    <PrefsEdit section={sec} data={data} getToken={getToken} onCancel={() => setSection(null)}
      onSaved={(d) => { setData(d); setSection(null); setNote({ kind: "ok", text: "Saved." }); }}
      onFail={(kind, text) => setNote({ kind, text })} />
  );

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-[2rem] font-black leading-none tracking-[-0.02em] text-electric sm:text-[2.5rem]">My Profile</h1>
        <p className="mt-3 text-muted">Your profile is complete. Changes here never restart onboarding or touch your flat listing.</p>
      </div>
      <div aria-live="polite" className="min-h-5 text-sm">{note?.kind === "ok" ? note.text : ""}</div>
      {note && note.kind !== "ok" && (
        <div role="alert" className="rounded-xl border-2 border-red-700 bg-white p-4">
          <p className="font-bold text-red-700">{note.text}</p>
          {note.kind === "conflict" && <button onClick={() => void reload()} className={`${btnNext} mt-3`}>Reload saved profile</button>}
        </div>
      )}

      <Card>
        {!editing ? (
          <>
            <div className="flex flex-wrap items-center gap-4">
              {p.avatarUrl ? <Avatar src={p.avatarUrl} /> : <Initials name={p.displayName ?? ""} />}
              <div>
                <p className="text-xl font-bold">{p.displayName}</p>
                <p className="text-sm text-muted">{[p.age != null && `${p.age} years old`, label(OCCUPATIONS, p.occupation), label(GENDERS, p.gender)].filter((x) => x && x !== "—").join(" · ")}</p>
              </div>
              <div className="flex flex-wrap gap-3 sm:ml-auto">
                <button type="button" onClick={() => { setNote(null); setEditing(true); }} className={cta}>Edit profile</button>
                <Link href={`/profiles/${data.publicId}`} className={ghost}>Preview profile</Link>
              </div>
            </div>
            {p.bio && <p className="mt-4 whitespace-pre-wrap">{p.bio}</p>}
            <p className="mt-4 text-sm"><span className="font-bold">Profile visibility:</span> {data.discoveryEnabled ? "Visible to other signed-in Flatter users." : "Not visible to other users yet. Discovery isn't live, and this setting applies when it is."}</p>
          </>
        ) : (
          <EditForm data={data} getToken={getToken}
            onCancel={() => setEditing(false)}
            onSaved={(d) => { setData(d); setEditing(false); setNote({ kind: "ok", text: "Profile saved." }); }}
            onFail={(kind, text) => setNote({ kind, text })} />
        )}
      </Card>

      <Card title="Account and security" id="acct-h">
        <p className="mt-3 text-sm text-muted">Email, linked Google account, password and security are managed in your sign-in account, separately from this profile.</p>
        <button type="button" onClick={() => openUserProfile()} className={`${ghost} mt-4`}>Manage account</button>
      </Card>

      <Card title="Looking for" id="intent-h" action={section === null ? editBtn("housing", "housing preferences") : undefined}>
        <p className="mt-3 font-bold">{INTENT_LABEL[data.intent]}</p>
        <p className="mt-1 text-sm text-muted">Your goal can&apos;t be changed here yet.</p>
        {section === "housing" ? <div className="mt-6">{sectionEditor("housing")}</div> : h && (
          <Rows rows={[
            ["City", h.city?.label ?? "Not set"],
            [data.intent === "HAVE_ROOM" ? "Flat locality" : "Preferred areas", h.locationsFlexible ? `Any supported area in ${h.city?.label ?? "the city"}` : h.localities.map((x) => x.label).filter(Boolean).join(", ") || "Not set"],
            [data.intent === "HAVE_ROOM" ? "Rent per person" : "Budget per person", data.intent === "HAVE_ROOM" ? inr(h.rentMinPaise) : `${inr(h.rentMinPaise)} – ${inr(h.rentMaxPaise)}`],
            [data.intent === "HAVE_ROOM" ? "Available from" : "Move-in", h.moveInFlexible ? "Flexible" : h.moveInDate ?? "—"],
          ]} />
        )}
        {section !== "housing" && h && !h.city?.label && <p className="mt-3 text-sm font-bold">Your saved location isn&apos;t one of our supported areas. Edit to choose again.</p>}
      </Card>

      <Card title="Your lifestyle" id="life-h" action={section === null ? editBtn("lifestyle", "lifestyle") : undefined}>
        {section === "lifestyle" ? <div className="mt-6">{sectionEditor("lifestyle")}</div> : <Rows rows={[
          ["Awake", label(SLEEP, l?.sleepSchedule)], ["Tidiness", label(CLEAN, l?.cleanliness)], ["Food", label(FOOD, l?.foodHabit)],
          ["Smoking", label(SMOKE, l?.smokingHabit)], ["Bringing a pet", l?.bringingPet == null ? "—" : l.bringingPet ? "Yes" : "No"], ["Guests", label(GUESTS, l?.guestFrequency)],
        ]} />}
      </Card>

      <Card title="What works for you in a flatmate" id="flat-pref-h" action={section === null ? editBtn("flatmate", "flatmate preferences") : undefined}>
        <p className="mt-2 text-sm text-muted">These are your preferences, separate from your own habits. They are private and never shown on your profile.</p>
        {section === "flatmate" ? <div className="mt-6">{sectionEditor("flatmate")}</div> : <Rows rows={[
          ["Sleep schedules", list(SLEEP, f?.acceptedSleepSchedules)], ["Tidiness", list(CLEAN, f?.acceptedCleanlinessLevels)], ["Food", list(FOOD, f?.acceptedFoodHabits)],
          ["Smoking", list(SMOKE, f?.acceptedSmokingHabits)], ["Genders", list(FLATMATE_GENDERS, f?.acceptedGenders)], ["Pets", label(PETS, f?.flatmatePetPreference)], ["Guests", list(GUESTS, f?.acceptedGuestFrequencies)],
        ]} />}
      </Card>

      {data.intent === "HAVE_ROOM" && <MyListing data={data} />}
    </div>
  );
}

type Section = "housing" | "lifestyle" | "flatmate";

// Adapt the saved profile to the shape the onboarding step forms expect, then reuse them for editing.
const asState = (d: MeData): OnboardingState => ({
  revision: d.version, onboardingCompletedAt: "done", discoveryEnabled: d.discoveryEnabled, housingIntent: d.intent, age: d.profile.age, profile: null,
  housing: d.housing && {
    city: d.housing.city?.id ?? null, preferredLocations: d.housing.localities.map((l) => l.id), locationsFlexible: d.housing.locationsFlexible,
    monthlyRentMinPaise: d.housing.rentMinPaise, monthlyRentMaxPaise: d.housing.rentMaxPaise, moveInDate: d.housing.moveInDate, moveInFlexible: d.housing.moveInFlexible,
  },
  lifestyle: d.lifestyle, flatmate: d.flatmate,
  stepValidity: { intent: true, about: true, housing: true, lifestyle: true, flatmate: true }, nextStep: "review",
});

function PrefsEdit({ section, data, getToken, onCancel, onSaved, onFail }: {
  section: Section; data: MeData; getToken: () => Promise<string | null>; onCancel: () => void; onSaved: (d: MeData) => void; onFail: (k: "error" | "conflict", t: string) => void;
}) {
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  async function submit(_path: string, body: Record<string, unknown>) {
    setBusy(true); setErrors({});
    try {
      onSaved(await api<MeData>(await getToken(), "PATCH", `/api/profile/me/${section}`, { version: data.version, ...body }));
    } catch (e) {
      if (!(e instanceof ApiFail)) onFail("error", "Something went wrong. Your edits are kept. Please retry.");
      else if (e.status === 409) onFail("conflict", "Your profile changed in another tab or device. Reload the saved profile, then re-apply your edits.");
      else { setErrors(e.fields); onFail("error", e.status === 422 ? "Please fix the highlighted answers." : e.message); }
    } finally {
      setBusy(false);
    }
  }
  const props = { state: asState(data), errors, busy, submit, back: onCancel, submitLabel: "Save changes", backLabel: "Cancel" };
  return section === "housing" ? <HousingStep {...props} /> : section === "lifestyle" ? <LifestyleStep {...props} /> : <FlatmateStep {...props} />;
}

function EditForm({ data, getToken, onCancel, onSaved, onFail }: {
  data: MeData; getToken: () => Promise<string | null>; onCancel: () => void; onSaved: (d: MeData) => void; onFail: (k: "error" | "conflict", t: string) => void;
}) {
  const p = data.profile;
  const [name, setName] = useState(p.displayName ?? "");
  const [occ, setOcc] = useState<string | null>(p.occupation);
  const [gender, setGender] = useState<string | null>(p.gender);
  const [bio, setBio] = useState(p.bio ?? "");
  const [visible, setVisible] = useState(data.discoveryEnabled);
  const [photo, setPhoto] = useState<PhotoAction>("keep");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const dirty = name !== (p.displayName ?? "") || occ !== p.occupation || gender !== p.gender || bio !== (p.bio ?? "") || visible !== data.discoveryEnabled || photo !== "keep";

  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  async function save() {
    setBusy(true); setErrors({});
    try {
      const saved = await api<MeData>(await getToken(), "PATCH", "/api/profile/me", {
        version: data.version, displayName: name, occupation: occ, gender, bio, discoveryEnabled: visible, ...(photo !== "keep" && { photoAction: photo }),
      });
      onSaved(saved);
    } catch (e) {
      if (!(e instanceof ApiFail)) onFail("error", "Something went wrong. Your edits are kept. Please retry.");
      else if (e.status === 409) onFail("conflict", "Your profile changed in another tab or device. Reload the saved profile, then re-apply your edits.");
      else { setErrors(e.fields); onFail("error", e.status === 422 ? "Please fix the highlighted answers." : e.message); }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); void save(); }} className="grid gap-6">
      <h2 ref={heading} tabIndex={-1} className="text-xl font-bold">Edit profile</h2>
      <Field name="displayName" label="What should we call you?" hint="Not your legal name." errors={errors}>
        <input id="displayName" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className={inputCls} aria-describedby={errors.displayName ? "displayName-error" : "displayName-hint"} aria-invalid={!!errors.displayName} />
      </Field>
      <RadioCards name="occupation" legend="What do you do?" options={OCCUPATIONS} value={occ} onChange={setOcc} errors={errors} />
      <RadioCards name="gender" legend="Gender" options={GENDERS} value={gender} onChange={setGender} errors={errors} />
      <Field name="bio" label="A little about you (optional)" hint="Up to 500 characters, shown as plain text." errors={errors}>
        <textarea id="bio" value={bio} maxLength={500} rows={4} onChange={(e) => setBio(e.target.value)} className={inputCls} aria-describedby={errors.bio ? "bio-error" : "bio-hint"} />
      </Field>
      <AvatarPicker name={name} savedUrl={p.avatarUrl} photo={photo} setPhoto={setPhoto} />
      <label className="flex items-start gap-3 rounded-xl border-2 border-indigo/30 bg-white p-4">
        <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} className="mt-1 size-4 accent-electric" />
        <span><span className="block font-bold">Make my profile visible to other signed-in Flatter users</span>
          <span className="block text-sm text-muted">Turning this off doesn&apos;t unpublish a flat listing you&apos;ve published separately.</span></span>
      </label>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <button type="button" onClick={() => { if (!dirty || window.confirm("Discard your unsaved changes?")) onCancel(); }} className={btnBack}>Cancel</button>
        <button type="submit" disabled={busy || !dirty} className={btnNext}>{busy ? "Saving…" : "Save changes"}</button>
      </div>
    </form>
  );
}

function MyListing({ data }: { data: MeData }) {
  const l = data.listing;
  return (
    <section id="listing" aria-labelledby="my-listing-h" className="scroll-mt-24 rounded-xl bg-white p-6">
      <h2 id="my-listing-h" className="font-mono text-xs font-bold uppercase tracking-wider text-muted">My flat listing</h2>
      {data.listingError ? (
        <p className="mt-3">We couldn&apos;t load your listing. <Link href="/dashboard/profile" className="underline">Retry</Link></p>
      ) : !l ? (
        <>
          <p className="mt-3 text-muted">You haven&apos;t created a flat listing yet.</p>
          <Link href="/dashboard/listing" className={`${cta} mt-4`}>Start your listing</Link>
        </>
      ) : (
        <>
          <p className="mt-3"><span className="rounded-full border border-electric px-3 py-1 font-mono text-xs font-bold uppercase tracking-wider text-electric">{STATUS_LABEL[l.status]}</span>
            {l.status !== "PUBLISHED" && <span className="ml-3 text-sm text-muted">Only you can see this.</span>}</p>
          <div className="mt-4 flex flex-wrap gap-4">
            {l.coverUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={l.coverUrl} alt="Cover photo of your flat" className="size-28 rounded-lg object-cover" />
              : <div aria-hidden="true" className="flex size-28 items-center justify-center rounded-lg bg-indigo/10 text-xs text-muted">No photo</div>}
            <div>
              <p className="text-lg font-bold">{l.title ?? "Untitled listing"}</p>
              <p className="text-sm text-muted">{[l.locality, l.city].filter(Boolean).join(", ") || "Location not set"}</p>
              <p className="mt-1">{inr(l.monthlyRentPaise)} per person / month</p>
            </div>
          </div>
          {l.details && (
            <details className="mt-4">
              <summary className="cursor-pointer font-bold">View listing details</summary>
              <div className="mt-3 grid gap-2 text-sm">
                <p>{[l.details.roomType && label([{ value: "PRIVATE", label: "Private room" }, { value: "SHARED", label: "Shared room" }], l.details.roomType), l.details.furnishing && label([{ value: "UNFURNISHED", label: "Unfurnished" }, { value: "SEMI_FURNISHED", label: "Semi-furnished" }, { value: "FURNISHED", label: "Furnished" }], l.details.furnishing), l.details.bedrooms && `${l.details.bedrooms} bedroom flat`, l.details.availablePlaces && `${l.details.availablePlaces} place(s) available`].filter(Boolean).join(" · ")}</p>
                <p>{l.details.availableFlexible ? "Available: flexible" : l.details.availableFrom ? `Available from ${l.details.availableFrom}` : ""}</p>
                <p>Deposit {inr(l.details.depositPaise)}</p>
                {l.details.chargesNote && <p><span className="font-bold">Charges:</span> {l.details.chargesNote}</p>}
                {l.details.description && <p className="whitespace-pre-wrap">{l.details.description}</p>}
                <p className="text-muted">Amenities not provided yet.</p>
              </div>
            </details>
          )}
          <Link href="/dashboard/listing" className={`${ghost} mt-4`}>{l.status === "PUBLISHED" ? "Manage listing" : "Open listing"}</Link>
        </>
      )}
    </section>
  );
}
