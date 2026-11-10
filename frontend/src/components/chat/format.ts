const day = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
export const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
export const dayOf = (iso: string) => {
  const d = new Date(iso), now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  if (d.toDateString() === new Date(now.getTime() - 86_400_000).toDateString()) return "Yesterday";
  return day(d);
};
/** Inbox row time: time of day today, otherwise a short date. */
export const shortWhen = (iso: string) => (new Date(iso).toDateString() === new Date().toDateString() ? timeOf(iso) : new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" }));
