// "1500" or "1500.50" rupees <-> integer paise, without floating point. Plain module: usable on server and client.
export function toPaise(s: string): number | null {
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(s.trim());
  return m ? Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0")) : null;
}
export const fromPaise = (p: number | null | undefined) =>
  p == null ? "" : `${Math.floor(p / 100)}${p % 100 ? `.${String(p % 100).padStart(2, "0")}` : ""}`;
export const inr = (p: number | null | undefined) => (p == null ? "—" : `₹${Number(fromPaise(p)).toLocaleString("en-IN")}`);
