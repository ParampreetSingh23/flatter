"use client";
import { useId, useState } from "react";
import { matches, type City } from "@/lib/locations";
import { FieldError, inputCls, type Errors } from "./fields";

export const NO_RESULTS = "This location isn't supported yet. Select a listed area.";

// Searchable, keyboard-accessible city combobox. Typing filters; it can never create an option.
export function CityCombobox({ cities, value, onChange, errors }: { cities: City[]; value: string; onChange: (id: string) => void; errors: Errors }) {
  const uid = useId();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selected = cities.find((c) => c.id === value);
  const list = cities.filter((c) => matches(q, c.label, ...c.aliases));
  const pick = (c: City) => { onChange(c.id); setQ(""); setOpen(false); };

  return (
    <div className="relative">
      <label htmlFor={`${uid}-input`} className="block font-bold">City</label>
      <p className="mt-1 text-sm text-muted">We&apos;re starting in Delhi NCR. Choose from our supported locations.</p>
      <input
        id={`${uid}-input`} role="combobox" aria-expanded={open} aria-controls={`${uid}-list`} aria-autocomplete="list"
        aria-activedescendant={open && list[active] ? `${uid}-${list[active].id}` : undefined}
        aria-describedby={errors.city ? "city-error" : undefined} aria-invalid={!!errors.city}
        autoComplete="off" placeholder="Search a city, e.g. Gurgaon" className={`${inputCls} mt-2`}
        value={open ? q : selected?.label ?? ""}
        onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, list.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
          else if (e.key === "Enter" && open && list[active]) { e.preventDefault(); pick(list[active]); }
          else if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && (
        <ul id={`${uid}-list`} role="listbox" aria-label="Cities" className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-xl border-2 border-indigo/30 bg-white shadow">
          {list.map((c, i) => (
            <li key={c.id} id={`${uid}-${c.id}`} role="option" aria-selected={c.id === value}
              onMouseDown={(e) => { e.preventDefault(); pick(c); }}
              className={`cursor-pointer px-4 py-3 ${i === active ? "bg-electric/10" : ""}`}>
              <span className="font-bold">{c.label}</span>
              <span className="text-sm text-muted"> · {c.state}</span>
              {c.note && <span className="block text-xs text-muted">{c.note}</span>}
            </li>
          ))}
          {list.length === 0 && <li role="status" className="px-4 py-3 text-sm">{NO_RESULTS}</li>}
        </ul>
      )}
      <FieldError name="city" errors={errors} />
    </div>
  );
}

// Locality list for one city: search filter, "Greater Noida West"-style visual groups, radio (one) or checkbox (many).
export function LocalityPicker({ city, single, value, onChange, errors, max = 5, legend, hint }: {
  city: City; single: boolean; value: string[]; onChange: (v: string[]) => void; errors: Errors; max?: number; legend: string; hint?: string;
}) {
  const uid = useId();
  const [q, setQ] = useState("");
  const shown = city.localities.filter((l) => matches(q, l.label, l.group, ...(l.aliases ?? [])));
  const groups = [...new Set(shown.map((l) => l.group ?? ""))];
  const toggle = (id: string) =>
    onChange(single ? [id] : value.includes(id) ? value.filter((x) => x !== id) : value.length >= max ? value : [...value, id]);
  const row = "flex cursor-pointer items-center gap-3 rounded-xl border-2 border-indigo/30 bg-white px-4 py-3 has-checked:border-electric has-checked:bg-electric/5 has-focus-visible:outline-2 has-focus-visible:outline-offset-2";

  return (
    <fieldset id="preferredLocations" aria-describedby={errors.preferredLocations ? "preferredLocations-error" : undefined}>
      <legend className="font-bold">{legend}</legend>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      <label htmlFor={`${uid}-q`} className="sr-only">Search localities in {city.label}</label>
      <input id={`${uid}-q`} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search in ${city.label}, e.g. Sector 16C`} className={`${inputCls} mt-3`} />
      {!single && <p className="mt-2 text-sm text-muted" aria-live="polite">{value.length} of {max} selected</p>}
      <div className="mt-3 grid gap-4">
        {groups.map((g) => (
          <div key={g} role="group" aria-label={g || undefined} className="grid gap-2 sm:grid-cols-2">
            {g && <p className="font-mono text-xs font-bold uppercase tracking-wider text-muted sm:col-span-2">{g}</p>}
            {shown.filter((l) => (l.group ?? "") === g).map((l) => (
              <label key={l.id} className={row}>
                <input type={single ? "radio" : "checkbox"} name={`${uid}-loc`} checked={value.includes(l.id)} onChange={() => toggle(l.id)} className="size-4 accent-electric" />
                {l.label}
              </label>
            ))}
          </div>
        ))}
        {shown.length === 0 && <p role="status" className="text-sm">{NO_RESULTS}</p>}
      </div>
      <FieldError name="preferredLocations" errors={errors} />
    </fieldset>
  );
}
