"use client";
import { useUser } from "@clerk/nextjs";
import { useState } from "react";
import type { Opt } from "@/lib/onboarding-types";

export const inputCls =
  "w-full rounded-xl border-2 border-indigo/30 bg-white px-4 py-3 text-base text-ink focus:border-electric";
export const btnNext =
  "inline-flex items-center justify-center rounded-xl bg-indigo px-6 py-3 font-mono text-xs font-bold uppercase tracking-wider text-white hover:bg-electric disabled:opacity-50";
export const btnBack =
  "inline-flex items-center justify-center rounded-xl border-2 border-indigo px-6 py-3 font-mono text-xs font-bold uppercase tracking-wider text-indigo hover:bg-indigo hover:text-white";

export type Errors = Record<string, string>;

const errId = (name: string) => `${name}-error`;
export const FieldError = ({ name, errors }: { name: string; errors: Errors }) =>
  errors[name] ? <p id={errId(name)} className="mt-2 text-sm font-bold text-red-700">{errors[name]}</p> : null;

export function Field({ name, label, hint, errors, children }: { name: string; label: string; hint?: string; errors: Errors; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={name} className="block font-bold">{label}</label>
      {hint && <p id={`${name}-hint`} className="mt-1 text-sm text-muted">{hint}</p>}
      <div className="mt-2">{children}</div>
      <FieldError name={name} errors={errors} />
    </div>
  );
}

// Native radio group rendered as selectable cards (keyboard + screen reader friendly).
export function RadioCards({ name, legend, hint, options, value, onChange, errors }: {
  name: string; legend: string; hint?: string; options: Opt[]; value: string | null; onChange: (v: string) => void; errors: Errors;
}) {
  return (
    <fieldset aria-describedby={errors[name] ? errId(name) : undefined} aria-invalid={!!errors[name]} id={name}>
      <legend className="font-bold">{legend}</legend>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      <div className="mt-3 grid gap-3">
        {options.map((o) => (
          <label key={o.value} className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-indigo/30 bg-white p-4 has-checked:border-electric has-checked:bg-electric/5 has-focus-visible:outline-2 has-focus-visible:outline-offset-2">
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="mt-1 size-4 accent-electric" />
            <span><span className="block font-bold">{o.label}</span>{o.desc && <span className="block text-sm text-muted">{o.desc}</span>}</span>
          </label>
        ))}
      </div>
      <FieldError name={name} errors={errors} />
    </fieldset>
  );
}

// Multi-select with explicit "Any of these is fine" (expands to every option; empty stays unanswered).
export function CheckGroup({ name, legend, hint, options, value, onChange, errors, anyLabel = "Any of these is fine", max }: {
  name: string; legend: string; hint?: string; options: Opt[]; value: string[]; onChange: (v: string[]) => void; errors: Errors; anyLabel?: string; max?: number;
}) {
  const all = value.length === options.length;
  const toggle = (v: string) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : max && value.length >= max ? value : [...value, v]);
  const box = "flex cursor-pointer items-center gap-3 rounded-xl border-2 border-indigo/30 bg-white px-4 py-3 has-checked:border-electric has-checked:bg-electric/5 has-focus-visible:outline-2 has-focus-visible:outline-offset-2";
  return (
    <fieldset aria-describedby={errors[name] ? errId(name) : undefined} id={name}>
      <legend className="font-bold">{legend}</legend>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className={`${box} sm:col-span-2`}>
          <input type="checkbox" checked={all} onChange={() => onChange(all ? [] : options.map((o) => o.value))} className="size-4 accent-electric" />
          <span className="font-bold">{anyLabel}</span>
        </label>
        {options.map((o) => (
          <label key={o.value} className={box}>
            <input type="checkbox" checked={value.includes(o.value)} onChange={() => toggle(o.value)} className="size-4 accent-electric" />
            <span>{o.label}{o.desc && <span className="block text-xs text-muted">{o.desc}</span>}</span>
          </label>
        ))}
      </div>
      <FieldError name={name} errors={errors} />
    </fieldset>
  );
}

export const Initials = ({ name, className = "size-16" }: { name: string; className?: string }) => (
  <span aria-hidden="true" className={`${className} inline-flex shrink-0 items-center justify-center rounded-full bg-indigo font-black text-white`}>
    {(name.trim()[0] ?? "?").toUpperCase()}
  </span>
);

export { fromPaise, inr, toPaise } from "@/lib/format";

// Clerk/Google-hosted URLs vary, so a plain img beats configuring next/image remote patterns.
export const Avatar = ({ src }: { src: string }) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img src={src} alt="Your profile photo" className="size-16 rounded-full object-cover" />
);

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export type PhotoAction = "keep" | "use_clerk" | "clear";

// Personal avatar: keep / use the Clerk account image / clear, plus Clerk's own image upload. Never an arbitrary URL.
export function AvatarPicker({ name, savedUrl, photo, setPhoto }: { name: string; savedUrl: string | null; photo: PhotoAction; setPhoto: (p: PhotoAction) => void }) {
  const { user } = useUser();
  const [upErr, setUpErr] = useState("");
  const [uploading, setUploading] = useState(false);
  const shown = photo === "clear" ? null : photo === "use_clerk" ? (user?.hasImage ? user.imageUrl : null) : savedUrl;

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
      setUpErr("Upload failed. Your photo was not changed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <p className="font-bold">Profile photo (optional)</p>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        {shown ? <Avatar src={shown} /> : <Initials name={name} />}
        <div className="flex flex-wrap gap-2">
          <label className={`${btnBack} cursor-pointer has-focus-visible:outline-2 has-focus-visible:outline-offset-2`}>
            {uploading ? "Uploading…" : "Upload photo"}
            <input type="file" accept={PHOTO_TYPES.join(",")} className="sr-only" disabled={uploading} onChange={(e) => upload(e.target.files?.[0])} />
          </label>
          {user?.hasImage && photo !== "use_clerk" && <button type="button" onClick={() => setPhoto("use_clerk")} className={btnBack}>Use my account photo</button>}
          {shown && <button type="button" onClick={() => setPhoto("clear")} className={btnBack}>Remove</button>}
        </div>
      </div>
      <p className="mt-2 text-sm text-muted">Uploading updates the photo on your Flatter sign-in account too. It is copied to your Flatter profile only when you save. Without one we show your initial.</p>
      {upErr && <p role="alert" className="mt-2 text-sm font-bold text-red-700">{upErr}</p>}
    </div>
  );
}
