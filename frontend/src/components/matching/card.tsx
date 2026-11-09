import { Icon, type IconName } from "@/components/icons";
import { inr } from "@/lib/format";
import type { DiscoveryCard } from "@/lib/matching-types";
import { label, OCCUPATIONS } from "@/lib/onboarding-types";
import { FlatPhoto } from "../dashboard/flat-photo";
import { Initials } from "../onboarding/fields";

const when = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export const Fact = ({ icon, children }: { icon: IconName; children: React.ReactNode }) => (
  <li className="flex items-start gap-3"><Icon name={icon} className="mt-0.5 size-5 text-ink" /><span>{children}</span></li>
);

// Allowlisted fields only (the API never sends DOB, contact data or accepted filters).
export function CardFacts({ c }: { c: Pick<DiscoveryCard, "city" | "flat" | "seeking"> }) {
  if (c.flat) {
    const f = c.flat;
    return (
      <ul className="grid gap-2 text-sm">
        <Fact icon="pin">{f.locality}{c.city?.label ? `, ${c.city.label}` : ""}</Fact>
        <Fact icon="rupee">{inr(f.rentPaise)} per person / month</Fact>
        <Fact icon="calendar">{f.availableFlexible ? "Flexible move-in" : f.availableFrom ? `Available from ${when(f.availableFrom)}` : "—"}</Fact>
      </ul>
    );
  }
  const s = c.seeking;
  if (!s) return null;
  return (
    <ul className="grid gap-2 text-sm">
      <Fact icon="pin">{s.localitiesFlexible ? `Anywhere in ${c.city?.label ?? "the city"}` : s.localities.filter(Boolean).join(", ")}</Fact>
      <Fact icon="rupee">{inr(s.rentMinPaise)} – {inr(s.rentMaxPaise)} per person / month</Fact>
      <Fact icon="calendar">{s.moveInFlexible ? "Flexible move-in" : s.moveInEarliest && s.moveInLatest ? `${when(s.moveInEarliest)} – ${when(s.moveInLatest)}` : "—"}</Fact>
    </ul>
  );
}

export function Who({ c, size = "size-16" }: { c: Pick<DiscoveryCard, "displayName" | "avatarUrl" | "age" | "occupation">; size?: string }) {
  return (
    <div className="flex items-center gap-4">
      {c.avatarUrl
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={c.avatarUrl} alt="" className={`${size} shrink-0 rounded-full object-cover`} />
        : <Initials name={c.displayName ?? ""} className={size} />}
      <div>
        <p className="text-xl font-bold tracking-[-0.01em] text-ink">{[c.displayName, c.age].filter((x) => x != null).join(", ")}</p>
        <p className="text-sm text-muted">{label(OCCUPATIONS, c.occupation) !== "—" ? label(OCCUPATIONS, c.occupation) : ""}</p>
      </div>
    </div>
  );
}

export const Score = ({ n }: { n: number }) => (
  <span className="inline-flex items-center gap-2 text-sm text-ink">
    <Icon name="sparkle" className="size-4" />{n}% compatible
  </span>
);

export const CoverPhoto = ({ c }: { c: DiscoveryCard }) =>
  c.flat ? <FlatPhoto src={c.flat.coverUrl} alt={`Photo of ${c.displayName ?? "their"} flat`} className="aspect-[16/9] w-full" /> : null;
