"use client";
import { useEffect, useState } from "react";
import { API_URL } from "./api";

export interface Locality { id: string; label: string; group?: string; aliases?: string[] }
export interface City { id: string; label: string; state: string; aliases: string[]; note?: string; localities: Locality[] }
export interface Catalogue { version: string; cities: City[] }

// One public catalogue owned by the backend; loaded once per session, filtered in memory.
let cache: Promise<Catalogue> | null = null;
const fetchCatalogue = () =>
  (cache ??= fetch(`${API_URL}/api/locations`).then((r) => {
    if (!r.ok) throw new Error("catalogue");
    return r.json() as Promise<Catalogue>;
  }));

export function useLocations() {
  const [data, setData] = useState<Catalogue | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let off = false;
    fetchCatalogue()
      .then((d) => !off && setData(d))
      .catch(() => { cache = null; if (!off) setFailed(true); });
    return () => { off = true; };
  }, [attempt]);
  return { data, failed, retry: () => { setFailed(false); setAttempt((n) => n + 1); } };
}

// Case, spacing, hyphens and Sec/Sector. Roman numerals are explicit aliases in the catalogue, never auto-converted.
const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\bsec\b/g, "sector").replace(/(\d) ([a-z])\b/g, "$1$2").trim();
export const matches = (query: string, ...texts: (string | undefined)[]) => {
  const q = norm(query);
  return !q || texts.some((t) => t && norm(t).includes(q));
};

export const cityLabel = (c: Catalogue | null, id: string | null | undefined) => c?.cities.find((x) => x.id === id)?.label ?? id ?? "—";
export const localityLabel = (c: Catalogue | null, id: string) => {
  for (const city of c?.cities ?? []) {
    const l = city.localities.find((x) => x.id === id);
    if (l) return `${l.label}, ${city.label}`;
  }
  return id;
};
