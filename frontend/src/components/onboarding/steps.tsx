"use client";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useState } from "react";
import {
  CLEAN, FOOD, GUESTS, INTENTS, label, OCCUPATIONS, PETS, SLEEP, SMOKE, type OnboardingState, type Opt,
} from "@/lib/onboarding-types";
import {
  btnBack, btnNext, CheckGroup, Field, FieldError, fromPaise, Initials, inputCls, inr, RadioCards, toPaise, type Errors,
} from "./fields";

export interface StepProps {
  state: OnboardingState;
  errors: Errors;
  busy: boolean;
  submit: (path: string, body: Record<string, unknown>) => void;
  back?: () => void;
}

const Nav = ({ busy, back, next = "Continue" }: { busy: boolean; back?: () => void; next?: string }) => (
  <div className="mt-10 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
    {back ? <button type="button" onClick={back} className={btnBack}>Back</button> : <span />}
    <button type="submit" disabled={busy} className={btnNext}>{busy ? "Saving…" : next}</button>
  </div>
);
const Form = ({ onSubmit, children, className = "" }: { onSubmit: () => void; children: React.ReactNode; className?: string }) => (
  <form noValidate onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className={`grid gap-8 ${className}`}>{children}</form>
);
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

// ---- 1 ----
export function IntentStep({ state, errors, busy, submit }: StepProps) {
  const [v, setV] = useState<string | null>(state.housingIntent);
  return (
    <Form onSubmit={() => submit("/intent", { housingIntent: v })}>
      <RadioCards name="housingIntent" legend="Choose one" options={INTENTS} value={v} onChange={setV} errors={errors} />
      <Nav busy={busy} />
    </Form>
  );
}

// ---- 2 ----
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export function AboutStep({ state, errors, busy, submit, back }: StepProps) {
  const { user } = useUser();
  const p = state.profile;
  const [name, setName] = useState(p?.displayName ?? user?.fullName ?? user?.firstName ?? "");
  const [dob, setDob] = useState(p?.birthDate ?? "");
  const [occ, setOcc] = useState<string | null>(p?.occupation ?? null);
  const [bio, setBio] = useState(p?.bio ?? "");
  // Prefill a real Clerk/Google photo on first visit; otherwise keep whatever is saved.
  const [photo, setPhoto] = useState<"keep" | "use_clerk" | "clear">(!p && user?.hasImage ? "use_clerk" : "keep");
  const [upErr, setUpErr] = useState("");
  const [uploading, setUploading] = useState(false);
  const shown = photo === "clear" ? null : photo === "use_clerk" ? (user?.hasImage ? user.imageUrl : null) : p?.avatarUrl ?? null;
  const [y, ...rest] = today().split("-");
  const max18 = `${Number(y) - 18}-${rest.join("-")}`;

  async function upload(f: File | undefined) {
    if (!f || !user) return;
    setUpErr("");
    if (!PHOTO_TYPES.includes(f.type)) return setUpErr("Use a JPG, PNG, WebP or GIF image.");
    if (f.size > 10 * 1024 * 1024) return setUpErr("Image must be 10 MB or smaller.");
    setUploading(true);
    try {
      await user.setProfileImage({ file: f });
      setPhoto("use_clerk");
    } catch {
      setUpErr("Upload failed. You can continue without a photo.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Form onSubmit={() => submit("/profile", { displayName: name, birthDate: dob, occupation: occ, bio, photoAction: photo })}>
      <Field name="displayName" label="What should we call you?" hint="Not your legal name. Shown to other flatmates." errors={errors}>
        <input id="displayName" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="given-name" className={inputCls} aria-describedby={errors.displayName ? "displayName-error" : "displayName-hint"} aria-invalid={!!errors.displayName} />
      </Field>
      <Field name="birthDate" label="Date of birth" hint="Flatter is for adults aged 18+. Private: others only ever see your age." errors={errors}>
        <input id="birthDate" type="date" value={dob} max={max18} onChange={(e) => setDob(e.target.value)} autoComplete="bday" className={inputCls} aria-describedby={errors.birthDate ? "birthDate-error" : "birthDate-hint"} aria-invalid={!!errors.birthDate} />
      </Field>
      <RadioCards name="occupation" legend="What do you do?" options={OCCUPATIONS} value={occ} onChange={setOcc} errors={errors} />
      <Field name="bio" label="A little about you (optional)" hint="Up to 500 characters, shown as plain text." errors={errors}>
        <textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={500} rows={4} className={inputCls} aria-describedby={errors.bio ? "bio-error" : "bio-hint"} />
      </Field>
      <div>
        <p className="font-bold">Profile photo (optional)</p>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          {shown ? <img src={shown} alt="Your profile photo" className="size-16 rounded-full object-cover" /> : <Initials name={name} />}
          <div className="flex flex-wrap gap-2">
            <label className={`${btnBack} cursor-pointer has-focus-visible:outline-2 has-focus-visible:outline-offset-2`}>
              {uploading ? "Uploading…" : "Upload photo"}
              <input type="file" accept={PHOTO_TYPES.join(",")} className="sr-only" disabled={uploading} onChange={(e) => upload(e.target.files?.[0])} />
            </label>
            {user?.hasImage && photo !== "use_clerk" && <button type="button" onClick={() => setPhoto("use_clerk")} className={btnBack}>Use my account photo</button>}
            {shown && <button type="button" onClick={() => setPhoto("clear")} className={btnBack}>Remove</button>}
          </div>
        </div>
        <p className="mt-2 text-sm text-muted">Uploading updates the photo on your Flatter sign-in account too. Without one we show your initial.</p>
        {upErr && <p role="alert" className="mt-2 text-sm font-bold text-red-700">{upErr}</p>}
      </div>
      <Nav busy={busy} back={back} />
    </Form>
  );
}

// ---- 3 ----
export function HousingStep({ state, errors, busy, submit, back }: StepProps) {
  const intent = state.housingIntent;
  const have = intent === "HAVE_ROOM";
  const h = state.housing;
  const [city, setCity] = useState(h?.city ?? "");
  const [locs, setLocs] = useState<string[]>(h?.preferredLocations ?? []);
  const [anywhere, setAnywhere] = useState(h?.locationsFlexible ?? false);
  const [min, setMin] = useState(fromPaise(h?.monthlyRentMinPaise));
  const [max, setMax] = useState(fromPaise(h?.monthlyRentMaxPaise));
  const [date, setDate] = useState(h?.moveInDate ?? "");
  const [flex, setFlex] = useState(h?.moveInFlexible ?? false);
  const localities = state.cities.find((c) => c.name === city)?.localities ?? [];
  const locOpts: Opt[] = localities.map((l) => ({ value: l, label: l }));

  function go() {
    const lo = toPaise(min);
    const hi = have ? lo : toPaise(max);
    // Unparseable money is sent as 0 so the server returns a field-level message.
    submit("/housing", {
      city, preferredLocations: anywhere ? [] : locs, locationsFlexible: anywhere,
      monthlyRentMinPaise: lo ?? 0, monthlyRentMaxPaise: hi ?? 0,
      moveInDate: flex ? null : date || null, moveInFlexible: flex,
    });
  }

  return (
    <Form onSubmit={go}>
      {!h && <p className="rounded-xl bg-electric/10 p-4 text-sm">Your answer changed the questions below, so please confirm this step.</p>}
      <Field name="city" label="City" errors={errors}>
        <select id="city" value={city} onChange={(e) => { setCity(e.target.value); setLocs([]); }} className={inputCls} aria-invalid={!!errors.city}>
          <option value="">Choose a city</option>
          {state.cities.map((c) => <option key={c.name}>{c.name}</option>)}
        </select>
      </Field>

      {have ? (
        <Field name="preferredLocations" label="Flat locality" hint="Area only, no street address." errors={errors}>
          <select id="preferredLocations" value={locs[0] ?? ""} onChange={(e) => setLocs(e.target.value ? [e.target.value] : [])} disabled={!city} className={inputCls}>
            <option value="">Choose a locality</option>
            {localities.map((l) => <option key={l}>{l}</option>)}
          </select>
        </Field>
      ) : (
        <div className="grid gap-3">
          <label className="flex items-center gap-3 font-bold"><input type="checkbox" checked={anywhere} onChange={(e) => setAnywhere(e.target.checked)} className="size-4 accent-electric" /> Anywhere in this city</label>
          {!anywhere && (
            <CheckGroup name="preferredLocations" legend="Preferred localities" hint="Pick up to 5." options={locOpts} value={locs} onChange={setLocs} errors={errors} max={5} anyLabel="Select all (up to 5)" />
          )}
          {anywhere && <FieldError name="preferredLocations" errors={errors} />}
        </div>
      )}

      <fieldset className="grid gap-4">
        <legend className="font-bold">{have ? "Monthly rent per person" : "Monthly rent budget per person"}</legend>
        <p className="-mt-2 text-sm text-muted">In ₹. Exclude deposit, utilities and brokerage.</p>
        <div className={have ? "" : "grid gap-4 sm:grid-cols-2"}>
          <Field name="monthlyRentMinPaise" label={have ? "Rent (₹)" : "Minimum (₹)"} errors={errors}>
            <input id="monthlyRentMinPaise" inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} className={inputCls} aria-invalid={!!errors.monthlyRentMinPaise} />
          </Field>
          {!have && (
            <Field name="monthlyRentMaxPaise" label="Maximum (₹)" errors={errors}>
              <input id="monthlyRentMaxPaise" inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} className={inputCls} aria-invalid={!!errors.monthlyRentMaxPaise} />
            </Field>
          )}
        </div>
        {have && <FieldError name="monthlyRentMaxPaise" errors={errors} />}
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="font-bold">{have ? "Available from" : "Earliest move-in"}</legend>
        <Field name="moveInDate" label="Date" errors={errors}>
          <input id="moveInDate" type="date" min={today()} value={flex ? "" : date} disabled={flex} onChange={(e) => setDate(e.target.value)} className={inputCls} aria-invalid={!!errors.moveInDate} />
        </Field>
        <label className="flex items-center gap-3"><input type="checkbox" checked={flex} onChange={(e) => setFlex(e.target.checked)} className="size-4 accent-electric" /> I&apos;m flexible</label>
      </fieldset>
      <Nav busy={busy} back={back} />
    </Form>
  );
}

// ---- 4 ----
export function LifestyleStep({ state, errors, busy, submit, back }: StepProps) {
  const l = state.lifestyle;
  const [v, setV] = useState({
    sleepSchedule: l?.sleepSchedule ?? null, cleanliness: l?.cleanliness ?? null, foodHabit: l?.foodHabit ?? null,
    smokingHabit: l?.smokingHabit ?? null, bringingPet: l?.bringingPet == null ? null : l.bringingPet ? "yes" : "no", guestFrequency: l?.guestFrequency ?? null,
  });
  const set = (k: keyof typeof v) => (x: string) => setV((s) => ({ ...s, [k]: x }));
  return (
    <Form onSubmit={() => submit("/lifestyle", { ...v, bringingPet: v.bringingPet === null ? null : v.bringingPet === "yes" })}>
      <RadioCards name="sleepSchedule" legend="When are you usually awake?" options={SLEEP} value={v.sleepSchedule} onChange={set("sleepSchedule")} errors={errors} />
      <RadioCards name="cleanliness" legend="How tidy do you keep shared spaces?" options={CLEAN} value={v.cleanliness} onChange={set("cleanliness")} errors={errors} />
      <RadioCards name="foodHabit" legend="What's your food preference?" hint="The diet you follow." options={FOOD} value={v.foodHabit} onChange={set("foodHabit")} errors={errors} />
      <RadioCards name="smokingHabit" legend="Do you smoke?" options={SMOKE} value={v.smokingHabit} onChange={set("smokingHabit")} errors={errors} />
      <RadioCards name="bringingPet" legend="Will you bring a pet?" options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} value={v.bringingPet} onChange={set("bringingPet")} errors={errors} />
      <RadioCards name="guestFrequency" legend="How often do you host guests?" hint="Home visits, not overnight stays." options={GUESTS} value={v.guestFrequency} onChange={set("guestFrequency")} errors={errors} />
      <Nav busy={busy} back={back} />
    </Form>
  );
}

// ---- 5 ----
export function FlatmateStep({ state, errors, busy, submit, back }: StepProps) {
  const f = state.flatmate;
  const [v, setV] = useState({
    acceptedSleepSchedules: f?.acceptedSleepSchedules ?? [], acceptedCleanlinessLevels: f?.acceptedCleanlinessLevels ?? [],
    acceptedFoodHabits: f?.acceptedFoodHabits ?? [], acceptedSmokingHabits: f?.acceptedSmokingHabits ?? [],
    acceptedGuestFrequencies: f?.acceptedGuestFrequencies ?? [], flatmatePetPreference: f?.flatmatePetPreference ?? null,
  });
  const set = <K extends keyof typeof v>(k: K) => (x: (typeof v)[K]) => setV((s) => ({ ...s, [k]: x }));
  return (
    <Form onSubmit={() => submit("/flatmate", v)}>
      <CheckGroup name="acceptedSleepSchedules" legend="Which sleep schedules work for you?" options={SLEEP} value={v.acceptedSleepSchedules} onChange={set("acceptedSleepSchedules")} errors={errors} />
      <CheckGroup name="acceptedCleanlinessLevels" legend="Which cleanliness levels work for you?" options={CLEAN} value={v.acceptedCleanlinessLevels} onChange={set("acceptedCleanlinessLevels")} errors={errors} />
      <CheckGroup name="acceptedFoodHabits" legend="Which food habits are you comfortable sharing a kitchen with?" options={FOOD} value={v.acceptedFoodHabits} onChange={set("acceptedFoodHabits")} errors={errors} />
      <CheckGroup name="acceptedSmokingHabits" legend="Which smoking habits are okay?" options={SMOKE} value={v.acceptedSmokingHabits} onChange={set("acceptedSmokingHabits")} errors={errors} />
      <RadioCards name="flatmatePetPreference" legend="Are you comfortable living with someone who brings a pet?" options={PETS} value={v.flatmatePetPreference} onChange={set("flatmatePetPreference")} errors={errors} />
      <CheckGroup name="acceptedGuestFrequencies" legend="How often can your flatmate host guests?" options={GUESTS} value={v.acceptedGuestFrequencies} onChange={set("acceptedGuestFrequencies")} errors={errors} />
      <Nav busy={busy} back={back} />
    </Form>
  );
}

// ---- 6 ----
export function ReviewStep({ state, errors, busy, submit, back }: StepProps) {
  const { user } = useUser();
  const [visible, setVisible] = useState(false); // unchecked by default
  const p = state.profile, h = state.housing, l = state.lifestyle, f = state.flatmate;
  const list = (opts: Opt[], vals: string[] | undefined) => (vals?.length ? vals.map((x) => label(opts, x)).join(", ") : "—");
  const Section = ({ title, step, rows }: { title: string; step: string; rows: [string, string][] }) => (
    <section className="rounded-xl bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">{title}</h2>
        <Link href={`/onboarding?step=${step}`} className="font-mono text-xs font-bold uppercase tracking-wider text-electric underline">Edit<span className="sr-only"> {title}</span></Link>
      </div>
      <dl className="mt-3 grid gap-2 text-sm">
        {rows.map(([k, v]) => <div key={k} className="grid gap-1 sm:grid-cols-[12rem_1fr]"><dt className="text-muted">{k}</dt><dd>{v}</dd></div>)}
      </dl>
    </section>
  );
  const photo = p?.avatarUrl ?? null;
  return (
    <Form onSubmit={() => submit("/complete", { discoveryEnabled: visible })}>
      <p className="rounded-xl bg-electric/10 p-4 text-sm">This is your draft profile. Flatter doesn&apos;t verify identity, and nothing here publishes a room listing.</p>
      <div className="flex items-center gap-4">
        {photo ? <img src={photo} alt="Your profile photo" className="size-16 rounded-full object-cover" /> : <Initials name={p?.displayName ?? user?.firstName ?? ""} />}
        <div><p className="text-xl font-bold">{p?.displayName}</p><p className="text-sm text-muted">{state.age != null && `${state.age} years old`}</p></div>
      </div>
      <Section title="Looking for" step="intent" rows={[["Goal", INTENTS.find((i) => i.value === state.housingIntent)?.label ?? "—"]]} />
      <Section title="About you" step="about" rows={[["Occupation", label(OCCUPATIONS, p?.occupation)], ["About", p?.bio || "—"]]} />
      <Section title="Housing" step="housing" rows={[
        ["City", h?.city ?? "—"],
        [state.housingIntent === "HAVE_ROOM" ? "Flat locality" : "Localities", h?.locationsFlexible ? "Anywhere in the city" : h?.preferredLocations.join(", ") || "—"],
        ["Rent per person", state.housingIntent === "HAVE_ROOM" ? inr(h?.monthlyRentMinPaise) : `${inr(h?.monthlyRentMinPaise)} – ${inr(h?.monthlyRentMaxPaise)}`],
        [state.housingIntent === "HAVE_ROOM" ? "Available from" : "Move-in", h?.moveInFlexible ? "Flexible" : h?.moveInDate ?? "—"],
      ]} />
      <Section title="Your lifestyle" step="lifestyle" rows={[
        ["Awake", label(SLEEP, l?.sleepSchedule)], ["Tidiness", label(CLEAN, l?.cleanliness)], ["Food", label(FOOD, l?.foodHabit)],
        ["Smoking", label(SMOKE, l?.smokingHabit)], ["Bringing a pet", l?.bringingPet == null ? "—" : l.bringingPet ? "Yes" : "No"], ["Guests", label(GUESTS, l?.guestFrequency)],
      ]} />
      <Section title="Flatmate preferences" step="flatmate" rows={[
        ["Sleep schedules", list(SLEEP, f?.acceptedSleepSchedules)], ["Tidiness", list(CLEAN, f?.acceptedCleanlinessLevels)], ["Food", list(FOOD, f?.acceptedFoodHabits)],
        ["Smoking", list(SMOKE, f?.acceptedSmokingHabits)], ["Pets", label(PETS, f?.flatmatePetPreference)], ["Guests", list(GUESTS, f?.acceptedGuestFrequencies)],
      ]} />
      <label className="flex items-start gap-3 rounded-xl border-2 border-indigo/30 bg-white p-4">
        <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} className="mt-1 size-4 accent-electric" />
        <span><span className="block font-bold">Make my completed profile visible to other signed-in Flatter users</span><span className="block text-sm text-muted">You can still finish without this. Discovery isn&apos;t live yet.</span></span>
      </label>
      <FieldError name="_" errors={errors} />
      <Nav busy={busy} back={back} next="Finish" />
    </Form>
  );
}
