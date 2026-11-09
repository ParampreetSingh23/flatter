"use client";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ApiFail, api } from "@/lib/api";
import {
  BLOCK_OF, FURNISHING, ROOM_TYPES, STATUS_LABEL, type ListingView, type Mine,
} from "@/lib/listing-types";
import { cityLabel, localityLabel, useLocations } from "@/lib/locations";
import { btnBack, btnNext, Field, FieldError, fromPaise, inputCls, inr, RadioCards, toPaise, type Errors } from "../onboarding/fields";
import { PhotosBlock } from "./photos";
import { PageSpinner, Spinner } from "../spinner";

type Block = "flat" | "rent" | "photos" | "review";
const BLOCKS: [Block, string][] = [["flat", "Flat and room"], ["rent", "Rent and availability"], ["photos", "Photos"], ["review", "Review and publish"]];

interface Form {
  title: string; description: string; cityId: string; localityId: string; bedrooms: string; availablePlaces: string; roomType: string | null; furnishing: string | null;
  rent: string; deposit: string; charges: string; availableFrom: string; flexible: boolean;
}
const initForm = (l: ListingView): Form => ({
  title: l.details.title ?? "", description: l.details.description ?? "", cityId: l.details.cityId ?? "", localityId: l.details.localityId ?? "",
  bedrooms: l.details.bedrooms?.toString() ?? "", availablePlaces: l.details.availablePlaces?.toString() ?? "", roomType: l.details.roomType, furnishing: l.details.furnishing,
  rent: fromPaise(l.details.monthlyRentPaise), deposit: fromPaise(l.details.depositPaise), charges: l.details.chargesNote ?? "",
  availableFrom: l.details.availableFrom ?? "", flexible: l.details.availableFlexible ?? false,
});
const omitEmpty = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== "" && v !== null && v !== undefined));

export function ListingEditor() {
  const { getToken, isLoaded } = useAuth();
  const [mine, setMine] = useState<Mine | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;
    let off = false;
    getToken()
      .then((t) => api<Mine>(t, "GET", "/api/listings/mine"))
      .then((m) => !off && setMine(m))
      .catch((e) => !off && setErr(e instanceof ApiFail ? e.message : "Something went wrong."));
    return () => { off = true; };
  }, [isLoaded, getToken, attempt]);

  async function create() {
    setCreating(true);
    try {
      const listing = await api<ListingView>(await getToken(), "POST", "/api/listings", {});
      setMine({ listing, canCreate: true });
    } catch (e) {
      setErr(e instanceof ApiFail ? e.message : "Something went wrong.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <div>
        <Link href="/dashboard" className="font-mono text-xs font-bold uppercase tracking-wider text-electric underline">← Dashboard</Link>
        {err ? (
          <div role="alert" className="mt-6 rounded-xl bg-white p-6">
            <p className="font-bold">{err}</p>
            <button onClick={() => { setErr(null); setAttempt((n) => n + 1); }} className={`${btnNext} mt-4`}>Retry</button>
          </div>
        ) : !mine ? <PageSpinner label="Loading your listing" />
        : mine.listing ? <Loaded key={mine.listing.id} initial={mine.listing} getToken={getToken} />
        : mine.canCreate ? (
          <div className="mt-6">
            <h1 className="text-[2rem] font-black leading-none tracking-[-0.02em] text-electric sm:text-[2.5rem]">Complete your flat listing</h1>
            <p className="mt-4">Your profile is ready. Your flat listing stays private until you publish it.</p>
            <button onClick={() => void create()} disabled={creating} className={`${btnNext} mt-6`}>{creating ? "Creating…" : "Start your listing"}</button>
          </div>
        ) : <p className="mt-6">Flat listings are for people who have a flat and need a flatmate.</p>}
      </div>
    </>
  );
}

function Loaded({ initial, getToken }: { initial: ListingView; getToken: () => Promise<string | null> }) {
  const [listing, setListing] = useState(initial);
  const versionRef = useRef(initial.version);
  const [block, setBlock] = useState<Block>("flat");
  const [form, setForm] = useState(() => initForm(initial));
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "error" | "conflict"; text: string } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  const apply = (l: ListingView) => { versionRef.current = l.version; setListing(l); };
  const call = async <T,>(method: string, path: string, body?: unknown) => api<T>(await getToken(), method, path, body);
  const set = <K extends keyof Form>(k: K) => (v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function run(fn: () => Promise<ListingView>, ok: string) {
    setBusy(true); setNote(null); setErrors({});
    try {
      apply(await fn());
      setNote({ kind: "ok", text: ok });
    } catch (e) {
      if (!(e instanceof ApiFail)) setNote({ kind: "error", text: "Something went wrong. Your inputs are kept. Please retry." });
      else if (e.status === 409 && e.code === "VERSION_CONFLICT") setNote({ kind: "conflict", text: "This listing changed in another tab or device. Reload the saved version, then re-apply your edits." });
      else {
        setErrors(e.fields);
        setNote({ kind: "error", text: e.message });
      }
    } finally {
      setBusy(false);
    }
  }
  const save = (fields: Record<string, unknown>) =>
    run(() => call<ListingView>("PATCH", `/api/listings/${listing.id}`, { version: versionRef.current, ...fields }),
      listing.status === "PUBLISHED" ? "Saved. Your listing is paused until you review and republish." : "Draft saved.");
  const act = (path: string, ok: string) => run(() => call<ListingView>("POST", `/api/listings/${listing.id}/${path}`, { version: versionRef.current }), ok);
  async function reload() {
    try { apply(await call<ListingView>("GET", `/api/listings/${listing.id}`)); setNote({ kind: "ok", text: "Reloaded the latest saved version." }); }
    catch { setNote({ kind: "error", text: "Couldn't reload. Please retry." }); }
  }
  const go = (b: Block) => { setBlock(b); setNote(null); setErrors({}); setTimeout(() => heading.current?.focus()); };

  const saveFlat = () => save(omitEmpty({
    title: form.title.trim(), description: form.description.trim(), cityId: form.cityId, localityId: form.localityId,
    bedrooms: form.bedrooms && Number(form.bedrooms), availablePlaces: form.availablePlaces && Number(form.availablePlaces), roomType: form.roomType, furnishing: form.furnishing,
  }));
  function saveRent() {
    const rent = form.rent.trim() ? toPaise(form.rent) : undefined, deposit = form.deposit.trim() ? toPaise(form.deposit) : undefined;
    const bad: Errors = {};
    if (rent === null) bad.monthlyRentPaise = "Enter a valid amount, like 15000";
    if (deposit === null) bad.depositPaise = "Enter a valid amount (0 is fine)";
    if (Object.keys(bad).length) return setErrors(bad);
    return save(omitEmpty({
      monthlyRentPaise: rent, depositPaise: deposit, chargesNote: form.charges.trim(),
      ...(form.flexible ? { availableFlexible: true } : form.availableFrom ? { availableFrom: form.availableFrom } : {}),
    }));
  }

  const title = BLOCKS.find(([b]) => b === block)![1];
  return (
    <div className="mt-6">
      <h1 className="text-[2rem] font-black leading-none tracking-[-0.02em] text-electric sm:text-[2.5rem]">Your flat listing</h1>
      <p className="mt-3"><span className="rounded-full border border-electric px-3 py-1 font-mono text-xs font-bold uppercase tracking-wider text-electric">{STATUS_LABEL[listing.status]}</span>
        <span className="ml-3 text-sm text-muted">Your profile is ready. Your flat listing stays private until you publish it.</span></p>
      <nav aria-label="Listing steps" className="mt-6 flex flex-wrap gap-2">
        {BLOCKS.map(([b, label], i) => (
          <button key={b} type="button" onClick={() => go(b)} aria-current={b === block ? "step" : undefined}
            className={`rounded-xl px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider ${b === block ? "bg-indigo text-white" : "border-2 border-indigo text-indigo"}`}>{i + 1}. {label}</button>
        ))}
      </nav>
      <h2 ref={heading} tabIndex={-1} className="mt-8 text-2xl font-bold">{title}</h2>

      <div aria-live="polite" className="mt-4 min-h-6 text-sm">{busy ? "Saving…" : note?.kind === "ok" ? note.text : ""}</div>
      {note && note.kind !== "ok" && (
        <div role="alert" className="rounded-xl border-2 border-red-700 bg-white p-4">
          <p className="font-bold text-red-700">{note.text}</p>
          {Object.keys(errors).length > 0 && <ul className="mt-2 list-disc pl-5 text-sm">{Object.entries(errors).map(([k, v]) => <li key={k}>{v}</li>)}</ul>}
          {note.kind === "conflict" && <button onClick={() => void reload()} className={`${btnNext} mt-3`}>Reload saved version</button>}
        </div>
      )}

      <div className="mt-6">
        {block === "flat" && <FlatBlock form={form} set={set} errors={errors} busy={busy} onSave={saveFlat} />}
        {block === "rent" && <RentBlock form={form} set={set} errors={errors} busy={busy} onSave={saveRent} />}
        {block === "photos" && (
          <PhotosBlock listing={listing} getVersion={() => versionRef.current} apply={apply} call={call}
            report={(text) => setNote({ kind: "error", text })} />
        )}
        {block === "review" && <ReviewBlock listing={listing} busy={busy} errors={errors} go={go}
          onPermission={(v) => save({ permissionConfirmed: v })}
          onPublish={() => void act("publish", "Published. Signed-in Flatter users can now see your listing.")}
          onPause={() => void act("pause", "Paused. Your listing is hidden.")}
          onClose={() => { if (window.confirm("Close this listing? It will be hidden. You can reopen it later.")) void act("close", "Closed. Your details and photos are saved."); }}
          onReopen={() => void act("reopen", "Reopened as a private draft. Review and publish again.")} />}
      </div>
      {block !== "review" && (
        <div className="mt-8 flex justify-between">
          <button type="button" onClick={() => go(BLOCKS[Math.max(0, BLOCKS.findIndex(([b]) => b === block) - 1)]![0])} disabled={block === "flat"} className={btnBack}>Back</button>
          <button type="button" onClick={() => go(BLOCKS[BLOCKS.findIndex(([b]) => b === block) + 1]![0])} className={btnBack}>Next</button>
        </div>
      )}
    </div>
  );
}

interface BlockProps { form: Form; set: <K extends keyof Form>(k: K) => (v: Form[K]) => void; errors: Errors; busy: boolean; onSave: () => void }
const SaveBar = ({ busy, onSave }: { busy: boolean; onSave: () => void }) => (
  <div className="mt-8"><button type="button" onClick={onSave} disabled={busy} className={btnNext}>{busy ? "Saving…" : "Save draft"}</button></div>
);

function FlatBlock({ form, set, errors, busy, onSave }: BlockProps) {
  const { data: cat, failed } = useLocations();
  const city = cat?.cities.find((c) => c.id === form.cityId);
  return (
    <div className="grid gap-6">
      <Field name="title" label="Title" hint="10–100 characters, e.g. “Sunny room near Saket metro”." errors={errors}>
        <input id="title" value={form.title} maxLength={100} onChange={(e) => set("title")(e.target.value)} className={inputCls} aria-describedby={errors.title ? "title-error" : "title-hint"} aria-invalid={!!errors.title} />
      </Field>
      <Field name="description" label="Description" hint="30–2,000 characters, plain text. Don't include phone numbers or an exact address." errors={errors}>
        <textarea id="description" value={form.description} maxLength={2000} rows={6} onChange={(e) => set("description")(e.target.value)} className={inputCls} aria-describedby={errors.description ? "description-error" : "description-hint"} aria-invalid={!!errors.description} />
      </Field>
      {failed ? <p role="alert">We couldn&apos;t load the supported locations. Reload the page to retry.</p> : !cat ? <Spinner label="Loading locations" className="size-6" /> : (
        <>
          <Field name="cityId" label="City" errors={errors}>
            <select id="cityId" value={form.cityId} onChange={(e) => { set("cityId")(e.target.value); set("localityId")(""); }} className={inputCls}>
              <option value="">Choose a city</option>
              {cat.cities.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </Field>
          <Field name="localityId" label="Locality" hint="Area only. No street address or flat number." errors={errors}>
            <select id="localityId" value={form.localityId} disabled={!city} onChange={(e) => set("localityId")(e.target.value)} className={inputCls}>
              <option value="">Choose a locality</option>
              {city?.localities.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
          </Field>
        </>
      )}
      <div className="grid gap-6 sm:grid-cols-2">
        <Field name="bedrooms" label="Bedrooms in the flat (1–10)" errors={errors}>
          <input id="bedrooms" type="number" min={1} max={10} value={form.bedrooms} onChange={(e) => set("bedrooms")(e.target.value)} className={inputCls} />
        </Field>
        <Field name="availablePlaces" label="People who can move in (1–10)" hint="Places available, not necessarily empty bedrooms." errors={errors}>
          <input id="availablePlaces" type="number" min={1} max={10} value={form.availablePlaces} onChange={(e) => set("availablePlaces")(e.target.value)} className={inputCls} aria-describedby="availablePlaces-hint" />
        </Field>
      </div>
      <RadioCards name="roomType" legend="Room type" options={ROOM_TYPES} value={form.roomType} onChange={set("roomType")} errors={errors} />
      <RadioCards name="furnishing" legend="Furnishing" options={FURNISHING} value={form.furnishing} onChange={set("furnishing")} errors={errors} />
      <SaveBar busy={busy} onSave={onSave} />
    </div>
  );
}

function RentBlock({ form, set, errors, busy, onSave }: BlockProps) {
  return (
    <div className="grid gap-6">
      <Field name="monthlyRentPaise" label="Monthly rent per person (₹)" hint="One actual amount, not a range." errors={errors}>
        <input id="monthlyRentPaise" inputMode="decimal" value={form.rent} onChange={(e) => set("rent")(e.target.value)} className={inputCls} aria-describedby={errors.monthlyRentPaise ? "monthlyRentPaise-error" : "monthlyRentPaise-hint"} />
      </Field>
      <Field name="depositPaise" label="Refundable deposit (₹)" hint="Enter 0 if there is no deposit." errors={errors}>
        <input id="depositPaise" inputMode="decimal" value={form.deposit} onChange={(e) => set("deposit")(e.target.value)} className={inputCls} aria-describedby={errors.depositPaise ? "depositPaise-error" : "depositPaise-hint"} />
      </Field>
      <Field name="chargesNote" label="Utilities, maintenance and other charges" hint="1–500 characters. “Included in rent” is fine." errors={errors}>
        <textarea id="chargesNote" rows={3} maxLength={500} value={form.charges} onChange={(e) => set("charges")(e.target.value)} className={inputCls} aria-describedby={errors.chargesNote ? "chargesNote-error" : "chargesNote-hint"} />
      </Field>
      <fieldset className="grid gap-3">
        <legend className="font-bold">Available from</legend>
        <Field name="availableFrom" label="Date" errors={errors}>
          <input id="availableFrom" type="date" value={form.flexible ? "" : form.availableFrom} disabled={form.flexible} onChange={(e) => set("availableFrom")(e.target.value)} className={inputCls} />
        </Field>
        <label className="flex items-center gap-3"><input type="checkbox" checked={form.flexible} onChange={(e) => set("flexible")(e.target.checked)} className="size-4 accent-electric" /> I&apos;m flexible</label>
      </fieldset>
      <SaveBar busy={busy} onSave={onSave} />
    </div>
  );
}

function ReviewBlock({ listing, busy, errors, go, onPermission, onPublish, onPause, onClose, onReopen }: {
  listing: ListingView; busy: boolean; errors: Errors; go: (b: Block) => void;
  onPermission: (v: boolean) => void; onPublish: () => void; onPause: () => void; onClose: () => void; onReopen: () => void;
}) {
  const { data: cat } = useLocations();
  const d = listing.details;
  const ready = listing.photos.filter((p) => p.state === "READY");
  const cover = ready.find((p) => p.isCover);
  const s = listing.status;
  return (
    <div className="grid gap-6">
      {s === "PAUSED" && <p className="rounded-xl bg-electric/10 p-4 text-sm">This listing is paused and hidden. Review the details, then publish again.</p>}
      {s === "CLOSED" && <p className="rounded-xl bg-electric/10 p-4 text-sm">This listing is closed. Your details and photos are saved. Reopen it to edit and publish again.</p>}

      <section className="rounded-xl bg-white p-5">
        <h3 className="font-bold">Private preview</h3>
        {cover?.url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover.url} alt="Cover photo of your flat" className="mt-3 aspect-4/3 w-full rounded-lg object-cover" />
        )}
        <p className="mt-3 text-xl font-bold">{d.title ?? "Untitled listing"}</p>
        <p className="text-sm text-muted">{[localityLabel(cat, d.localityId ?? "").split(",")[0], cityLabel(cat, d.cityId)].filter((x) => x && x !== "—").join(", ") || "Location not set"}</p>
        <p className="mt-2">{inr(d.monthlyRentPaise)} per person / month · deposit {inr(d.depositPaise)}</p>
        <p className="mt-2 text-sm">{[d.roomType && ROOM_TYPES.find((r) => r.value === d.roomType)?.label, d.furnishing && FURNISHING.find((r) => r.value === d.furnishing)?.label, d.bedrooms && `${d.bedrooms} bedroom flat`, d.availablePlaces && `${d.availablePlaces} place(s) available`].filter(Boolean).join(" · ")}</p>
        <p className="mt-2 text-sm">{d.availableFlexible ? "Available: flexible" : d.availableFrom ? `Available from ${d.availableFrom}` : ""}</p>
        {d.description && <p className="mt-3 whitespace-pre-wrap text-sm">{d.description}</p>}
        {d.chargesNote && <p className="mt-3 text-sm"><span className="font-bold">Charges:</span> {d.chargesNote}</p>}
        <p className="mt-3 text-sm text-muted">{ready.length} photo(s). Categories are declared by you; Flatter doesn&apos;t verify the flat or ownership.</p>
      </section>

      <section>
        <h3 className="font-bold">{listing.checklist.canPublish ? "Ready to publish" : "Still needed before you can publish"}</h3>
        <ul className="mt-2 grid gap-1 text-sm">
          {listing.checklist.missing.map((m) => (
            <li key={m.field} className="flex flex-wrap items-center gap-3">
              <span>• {m.message}</span>
              {BLOCK_OF[m.field] && BLOCK_OF[m.field] !== "review" && <button type="button" onClick={() => go(BLOCK_OF[m.field]!)} className="underline">Fix<span className="sr-only"> {m.field}</span></button>}
            </li>
          ))}
        </ul>
      </section>

      <label className="flex items-start gap-3 rounded-xl border-2 border-indigo/30 bg-white p-4">
        <input type="checkbox" checked={d.permissionConfirmed} disabled={busy || s === "CLOSED"} onChange={(e) => onPermission(e.target.checked)} className="mt-1 size-4 accent-electric" />
        <span>
          <span className="block font-bold">I have permission to advertise this space and use these photos.</span>
          <span className="block text-sm text-muted">Publishing shows this listing, plus your name and photo, to signed-in Flatter users. It doesn&apos;t change your personal profile visibility. This is your confirmation, not a verification badge.</span>
        </span>
      </label>
      <FieldError name="permissionConfirmed" errors={errors} />

      <div className="flex flex-wrap gap-3">
        {(s === "DRAFT" || s === "PAUSED") && <button type="button" onClick={onPublish} disabled={busy || !listing.checklist.canPublish} className={btnNext}>{s === "PAUSED" ? "Republish" : "Publish listing"}</button>}
        {s === "PUBLISHED" && <button type="button" onClick={onPause} disabled={busy} className={btnBack}>Pause listing</button>}
        {s === "CLOSED" && <button type="button" onClick={onReopen} disabled={busy} className={btnNext}>Reopen as draft</button>}
        {s !== "CLOSED" && <button type="button" onClick={onClose} disabled={busy} className={btnBack}>Close listing</button>}
      </div>
    </div>
  );
}
