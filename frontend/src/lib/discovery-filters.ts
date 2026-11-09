// Discovery filters live in the URL so details/back navigation keeps them. Only these keys ever survive:
// anything else in a query string (for example a returnTo) is dropped, never followed or echoed.
import { fromPaise, toPaise } from "./format";

export interface Filters { localities: string[]; rentMin: string; rentMax: string; from: string; to: string }
export const NO_FILTERS: Filters = { localities: [], rentMin: "", rentMax: "", from: "", to: "" };

type Get = (key: string) => string | null | undefined;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const LOCALITY = /^[a-z0-9][a-z0-9.-]{0,60}$/;
const PAISE = /^[1-9]\d{0,9}$/;
const MAX_PAISE = 2147483647;

/** Canonical "?a=b" (or "") from any source of query values, keeping only valid allowlisted filters. */
export function safeQuery(get: Get): string {
  const q = new URLSearchParams();
  const localities = [...new Set((get("localities") ?? "").split(",").map((s) => s.trim()).filter((s) => LOCALITY.test(s)))].slice(0, 20);
  if (localities.length) q.set("localities", localities.join(","));
  for (const k of ["rentMinPaise", "rentMaxPaise"]) {
    const v = get(k) ?? "";
    if (PAISE.test(v) && Number(v) <= MAX_PAISE) q.set(k, v);
  }
  for (const k of ["moveInFrom", "moveInTo"]) {
    const v = get(k) ?? "";
    if (DATE.test(v)) q.set(k, v);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** Server pages receive `searchParams` as a plain record (string or string[]). */
export const safeQueryFrom = (sp: Record<string, string | string[] | undefined>) =>
  safeQuery((k) => { const v = sp[k]; return Array.isArray(v) ? v[0] : v; });

export function toQuery(f: Filters): string {
  const rec: Record<string, string> = {
    localities: f.localities.join(","), moveInFrom: f.from, moveInTo: f.to,
    rentMinPaise: String(toPaise(f.rentMin) ?? ""), rentMaxPaise: String(toPaise(f.rentMax) ?? ""),
  };
  return safeQuery((k) => rec[k]);
}

export function filtersFromQuery(qs: string): Filters {
  const q = new URLSearchParams(qs);
  const rupees = (k: string) => (q.get(k) ? fromPaise(Number(q.get(k))) : "");
  return {
    localities: (q.get("localities") ?? "").split(",").filter(Boolean),
    rentMin: rupees("rentMinPaise"), rentMax: rupees("rentMaxPaise"), from: q.get("moveInFrom") ?? "", to: q.get("moveInTo") ?? "",
  };
}

export const discoverHref = (qs = "") => `/dashboard/discover${qs}`;
export const detailHref = (publicId: string, qs = "") => `/dashboard/discover/${encodeURIComponent(publicId)}${qs}`;
