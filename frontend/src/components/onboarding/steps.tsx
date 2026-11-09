"use client";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useState } from "react";
import { Spinner } from "../spinner";
import { cityLabel, localityLabel, useLocations } from "@/lib/locations";
import {
  CLEAN, FLATMATE_GENDERS, FOOD, GENDERS, GUESTS, INTENTS, label, OCCUPATIONS, PETS, SLEEP, SMOKE, type OnboardingState, type Opt,
} from "@/lib/onboarding-types";
import {
  AvatarPicker, Avatar, btnBack, btnNext, CheckGroup, Field, FieldError, fromPaise, Initials, inputCls, inr, RadioCards, toPaise, type Errors,
} from "./fields";
import { CityCombobox, LocalityPicker } from "./location-picker";
import { Card, ghost } from "../dashboard/blocks";
import { DetailRows } from "../dashboard/detail-rows";

export interface StepProps {
  state: OnboardingState;
  errors: Errors;
  busy: boolean;
  submit: (path: string, body: Record<string, unknown>) => void;
  back?: () => void;
  submitLabel?: string; // edit screens say "Save changes" / "Cancel"
  backLabel?: string;
}

const Nav = ({ busy, back, next = "Continue", backLabel = "Back" }: { busy: boolean; back?: () => void; next?: string; backLabel?: string }) => (
  <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
    {back ? <button type="button" onClick={back} className={btnBack}>{backLabel}</button> : <span />}
    <button type="submit" disabled={busy} className={btnNext}>{busy ? "Saving…" : next}</button>
  </div>
);
const Form = ({ onSubmit, children, className = "" }: { onSubmit: () => void; children: React.ReactNode; className?: string }) => (
  <form noValidate onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className={`grid gap-6 lg:gap-4 ${className}`}>{children}</form>
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
export function AboutStep({ state, errors, busy, submit, back }: StepProps) {
  const { user } = useUser();
  const p = state.profile;
  const [name, setName] = useState(p?.displayName ?? user?.fullName ?? user?.firstName ?? "");
  const [dob, setDob] = useState(p?.birthDate ?? "");
  const [gender, setGender] = useState<string | null>(p?.gender ?? null);
  const [occ, setOcc] = useState<string | null>(p?.occupation ?? null);
  const [bio, setBio] = useState(p?.bio ?? "");
  // Prefill a real Clerk/Google photo on first visit; otherwise keep whatever is saved.
  const [photo, setPhoto] = useState<"keep" | "use_clerk" | "clear">(!p && user?.hasImage ? "use_clerk" : "keep");
  const [y, ...rest] = today().split("-");
  const max18 = `${Number(y) - 18}-${rest.join("-")}`;

  return (
    <Form onSubmit={() => submit("/profile", { displayName: name, birthDate: dob, gender, occupation: occ, bio, photoAction: photo })}>
      <Field name="displayName" label="What should we call you?" hint="Not your legal name. Shown to other flatmates." errors={errors}>
        <input id="displayName" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="given-name" className={inputCls} aria-describedby={errors.displayName ? "displayName-error" : "displayName-hint"} aria-invalid={!!errors.displayName} />
      </Field>
      <Field name="birthDate" label="Date of birth" hint="Flatter is for adults aged 18+. Private: others only ever see your age." errors={errors}>
        <input id="birthDate" type="date" value={dob} max={max18} onChange={(e) => setDob(e.target.value)} autoComplete="bday" className={inputCls} aria-describedby={errors.birthDate ? "birthDate-error" : "birthDate-hint"} aria-invalid={!!errors.birthDate} />
      </Field>
      <RadioCards name="gender" legend="What is your gender?" hint="Used for matching. Choose what fits you, or prefer not to say." options={GENDERS} value={gender} onChange={setGender} errors={errors} />
      <RadioCards name="occupation" legend="What do you do?" options={OCCUPATIONS} value={occ} onChange={setOcc} errors={errors} />
      <Field name="bio" label="A little about you (optional)" hint="Up to 500 characters, shown as plain text." errors={errors}>
        <textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={500} rows={4} className={inputCls} aria-describedby={errors.bio ? "bio-error" : "bio-hint"} />
      </Field>
      <AvatarPicker name={name} savedUrl={p?.avatarUrl ?? null} photo={photo} setPhoto={setPhoto} />
      <Nav busy={busy} back={back} />
    </Form>
  );
}

// ---- 3 ----
export function HousingStep({ state, errors, busy, submit, back, submitLabel, backLabel }: StepProps) {
  const intent = state.housingIntent;
  const have = intent === "HAVE_ROOM";
  const h = state.housing;
  const { data: cat, failed, retry } = useLocations();
  const [city, setCity] = useState(h?.city ?? "");
  const [locs, setLocs] = useState<string[]>(h?.preferredLocations ?? []);
  const [anywhere, setAnywhere] = useState(h?.locationsFlexible ?? false);
  const [replaced, setReplaced] = useState(false);
  const [min, setMin] = useState(fromPaise(h?.monthlyRentMinPaise));
  const [max, setMax] = useState(fromPaise(h?.monthlyRentMaxPaise));
  const [date, setDate] = useState(h?.moveInDate ?? "");
  const [flex, setFlex] = useState(h?.moveInFlexible ?? false);
  const selected = cat?.cities.find((c) => c.id === city);

  function changeCity(id: string) {
    if (id === city) return;
    setReplaced(locs.length > 0 || anywhere); // warn that old choices are replaced
    setCity(id); setLocs([]); setAnywhere(false); // flexibility goes back to unanswered
  }
  function go() {
    const lo = toPaise(min);
    const hi = have ? lo : toPaise(max);
    const valid = locs.filter((id) => selected?.localities.some((l) => l.id === id)); // drop stale/legacy IDs
    // Unparseable money is sent as 0 so the server returns a field-level message.
    submit("/housing", {
      city, preferredLocations: anywhere ? [] : valid, locationsFlexible: anywhere,
      monthlyRentMinPaise: lo ?? 0, monthlyRentMaxPaise: hi ?? 0,
      moveInDate: flex ? null : date || null, moveInFlexible: flex,
    });
  }

  if (failed) {
    return (
      <div role="alert" className="rounded-2xl bg-white p-6 sm:p-8 lg:p-5">
        <p className="font-bold">We couldn&apos;t load the supported locations.</p>
        <p className="mt-1 text-sm text-muted">Your other answers are saved. Retry to continue.</p>
        <button type="button" onClick={retry} className={`${btnNext} mt-4`}>Retry</button>
        <div className="mt-6"><button type="button" onClick={back} className={btnBack}>Back</button></div>
      </div>
    );
  }
  if (!cat) return <div className="flex justify-center py-8"><Spinner label="Loading supported locations" className="size-8" /></div>;

  return (
    <Form onSubmit={go}>
      {!selected && h && <p className="rounded-2xl bg-surface-card p-4 text-sm">Your saved location isn&apos;t in our supported areas. Please choose again.</p>}
      <CityCombobox cities={cat.cities} value={selected ? city : ""} onChange={changeCity} errors={errors} />
      {replaced && <p role="status" className="-mt-4 text-sm text-muted">Your previous location choices were replaced.</p>}

      {selected && have && (
        <LocalityPicker city={selected} single value={locs} onChange={setLocs} errors={errors} legend="Flat locality"
          hint="Choose the supported area your flat is in. Area only, no street address." />
      )}
      {selected && !have && (
        <div className="grid gap-4">
          <label className="flex items-center gap-3 font-bold">
            <input type="checkbox" checked={anywhere} onChange={(e) => setAnywhere(e.target.checked)} className="size-4 accent-ink" />
            Any supported area in {selected.label}
          </label>
          {anywhere ? <FieldError name="preferredLocations" errors={errors} /> : (
            <LocalityPicker city={selected} single={false} value={locs} onChange={setLocs} errors={errors} legend="Preferred localities" hint="Pick up to 5." />
          )}
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
        <label className="flex items-center gap-3"><input type="checkbox" checked={flex} onChange={(e) => setFlex(e.target.checked)} className="size-4 accent-ink" /> I&apos;m flexible</label>
      </fieldset>
      <Nav busy={busy} back={back} {...(submitLabel && { next: submitLabel })} {...(backLabel && { backLabel })} />
    </Form>
  );
}

// ---- 4 ----
export function LifestyleStep({ state, errors, busy, submit, back, submitLabel, backLabel }: StepProps) {
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
      <Nav busy={busy} back={back} {...(submitLabel && { next: submitLabel })} {...(backLabel && { backLabel })} />
    </Form>
  );
}

// ---- 5 ----
export function FlatmateStep({ state, errors, busy, submit, back, submitLabel, backLabel }: StepProps) {
  const f = state.flatmate;
  const [v, setV] = useState({
    acceptedSleepSchedules: f?.acceptedSleepSchedules ?? [], acceptedCleanlinessLevels: f?.acceptedCleanlinessLevels ?? [],
    acceptedFoodHabits: f?.acceptedFoodHabits ?? [], acceptedSmokingHabits: f?.acceptedSmokingHabits ?? [],
    acceptedGuestFrequencies: f?.acceptedGuestFrequencies ?? [], acceptedGenders: f?.acceptedGenders ?? [], flatmatePetPreference: f?.flatmatePetPreference ?? null,
  });
  const set = <K extends keyof typeof v>(k: K) => (x: (typeof v)[K]) => setV((s) => ({ ...s, [k]: x }));
  return (
    <Form onSubmit={() => submit("/flatmate", v)}>
      <CheckGroup name="acceptedSleepSchedules" legend="Which sleep schedules work for you?" options={SLEEP} value={v.acceptedSleepSchedules} onChange={set("acceptedSleepSchedules")} errors={errors} />
      <CheckGroup name="acceptedCleanlinessLevels" legend="Which cleanliness levels work for you?" options={CLEAN} value={v.acceptedCleanlinessLevels} onChange={set("acceptedCleanlinessLevels")} errors={errors} />
      <CheckGroup name="acceptedFoodHabits" legend="Which food habits are you comfortable sharing a kitchen with?" options={FOOD} value={v.acceptedFoodHabits} onChange={set("acceptedFoodHabits")} errors={errors} />
      <CheckGroup name="acceptedSmokingHabits" legend="Which smoking habits are okay?" options={SMOKE} value={v.acceptedSmokingHabits} onChange={set("acceptedSmokingHabits")} errors={errors} />
      <CheckGroup name="acceptedGenders" legend="Which genders are you comfortable living with?" options={FLATMATE_GENDERS} value={v.acceptedGenders} onChange={set("acceptedGenders")} errors={errors} />
      <RadioCards name="flatmatePetPreference" legend="Are you comfortable living with someone who brings a pet?" options={PETS} value={v.flatmatePetPreference} onChange={set("flatmatePetPreference")} errors={errors} />
      <CheckGroup name="acceptedGuestFrequencies" legend="How often can your flatmate host guests?" options={GUESTS} value={v.acceptedGuestFrequencies} onChange={set("acceptedGuestFrequencies")} errors={errors} />
      <Nav busy={busy} back={back} {...(submitLabel && { next: submitLabel })} {...(backLabel && { backLabel })} />
    </Form>
  );
}

function Section({ title, step, rows }: { title: string; step: string; rows: [string, string][] }) {
  return (
    <Card title={title} id={`review-${step}-h`} action={
      <Link href={`/onboarding?step=${step}`} className={ghost}>Edit<span className="sr-only"> {title}</span></Link>
    }>
      <DetailRows rows={rows} />
    </Card>
  );
}

// ---- 6 ----
export function ReviewStep({ state, errors, busy, submit, back }: StepProps) {
  const { user } = useUser();
  const [visible, setVisible] = useState(false); // unchecked by default
  const { data: cat } = useLocations();
  const p = state.profile, h = state.housing, l = state.lifestyle, f = state.flatmate;
  const list = (opts: Opt[], vals: string[] | undefined) => (vals?.length ? vals.map((x) => label(opts, x)).join(", ") : "—");
  const photo = p?.avatarUrl ?? null;
  return (
    <Form onSubmit={() => submit("/complete", { discoveryEnabled: visible })}>
      <p className="rounded-2xl bg-surface-card p-4 text-sm">This is your draft profile. Flatter doesn&apos;t verify identity, and nothing here publishes a room listing.</p>
      <div className="flex items-center gap-4">
        {photo ? <Avatar src={photo} /> : <Initials name={p?.displayName ?? user?.firstName ?? ""} />}
        <div><p className="text-xl font-bold">{p?.displayName}</p><p className="text-sm text-muted">{state.age != null && `${state.age} years old`}</p></div>
      </div>
      <Section title="Looking for" step="intent" rows={[["Goal", INTENTS.find((i) => i.value === state.housingIntent)?.label ?? "—"]]} />
      <Section title="About you" step="about" rows={[["Gender", label(GENDERS, p?.gender)], ["Occupation", label(OCCUPATIONS, p?.occupation)], ["About", p?.bio || "—"]]} />
      <Section title="Housing" step="housing" rows={[
        ["City", cityLabel(cat, h?.city)],
        [state.housingIntent === "HAVE_ROOM" ? "Flat locality" : "Localities", h?.locationsFlexible ? `Any supported area in ${cityLabel(cat, h.city)}` : h?.preferredLocations.map((id) => localityLabel(cat, id)).join("; ") || "—"],
        ["Rent per person", state.housingIntent === "HAVE_ROOM" ? inr(h?.monthlyRentMinPaise) : `${inr(h?.monthlyRentMinPaise)} – ${inr(h?.monthlyRentMaxPaise)}`],
        [state.housingIntent === "HAVE_ROOM" ? "Available from" : "Move-in", h?.moveInFlexible ? "Flexible" : h?.moveInDate ?? "—"],
      ]} />
      <Section title="Your lifestyle" step="lifestyle" rows={[
        ["Awake", label(SLEEP, l?.sleepSchedule)], ["Tidiness", label(CLEAN, l?.cleanliness)], ["Food", label(FOOD, l?.foodHabit)],
        ["Smoking", label(SMOKE, l?.smokingHabit)], ["Bringing a pet", l?.bringingPet == null ? "—" : l.bringingPet ? "Yes" : "No"], ["Guests", label(GUESTS, l?.guestFrequency)],
      ]} />
      <Section title="Flatmate preferences" step="flatmate" rows={[
        ["Sleep schedules", list(SLEEP, f?.acceptedSleepSchedules)], ["Tidiness", list(CLEAN, f?.acceptedCleanlinessLevels)], ["Food", list(FOOD, f?.acceptedFoodHabits)],
        ["Smoking", list(SMOKE, f?.acceptedSmokingHabits)], ["Genders", list(FLATMATE_GENDERS, f?.acceptedGenders)], ["Pets", label(PETS, f?.flatmatePetPreference)], ["Guests", list(GUESTS, f?.acceptedGuestFrequencies)],
      ]} />
      <label className="flex items-start gap-3 rounded-2xl border border-hairline bg-white p-4">
        <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} className="mt-1 size-4 accent-ink" />
        <span><span className="block font-bold">Make my completed profile visible to other signed-in Flatter users</span><span className="block text-sm text-muted">You can still finish without this. Discovery isn&apos;t live yet.</span></span>
      </label>
      <FieldError name="_" errors={errors} />
      <Nav busy={busy} back={back} next="Finish" />
    </Form>
  );
}
