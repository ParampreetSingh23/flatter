import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import type { DashboardData, HousingSummary, ListingSummary } from "@/lib/dashboard-types";
import { inr } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/listing-types";
import type { Intent } from "@/lib/onboarding-types";
import { DetailRows } from "./detail-rows";

export const cta = "inline-flex min-h-11 items-center justify-center rounded-2xl bg-primary px-3.5 py-1.5 text-sm font-bold leading-none text-white hover:bg-primary-pressed active:bg-primary-pressed disabled:bg-surface-card disabled:text-ash";
export const ghost = "inline-flex min-h-11 items-center justify-center rounded-2xl bg-secondary px-3.5 py-1.5 text-sm font-bold leading-none text-ink hover:bg-secondary-pressed active:bg-secondary-pressed disabled:bg-surface-card disabled:text-ash";
// Tertiary: transparent until hovered (DESIGN.md button-tertiary). For low-emphasis actions such as Report or block.
export const quiet = "inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-3.5 py-1.5 text-sm font-bold leading-none text-ink hover:bg-surface-card active:bg-secondary disabled:text-ash";
// Compact secondary (still a 44px target): inline row actions such as Fix, Retry, Dismiss, Remove.
export const small = "inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-secondary px-3 py-2 text-sm font-bold leading-none text-ink hover:bg-secondary-pressed active:bg-secondary-pressed disabled:bg-surface-card disabled:text-ash";
export const Card = ({ title, children, id, action, icon, className = "" }: { title?: string; children: React.ReactNode; id?: string; action?: React.ReactNode; icon?: IconName; className?: string }) => (
  <section aria-labelledby={id} className={`rounded-2xl bg-white p-6 sm:p-8 lg:p-5 ${className}`}>
    {title && (
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {icon && <span className="flex size-9 items-center justify-center rounded-2xl bg-surface-card text-ink"><Icon name={icon} /></span>}
          <h2 id={id} className="text-lg font-semibold leading-[1.3] text-ink">{title}</h2>
        </div>
        {action}
      </div>
    )}
    {children}
  </section>
);

// Typed mapping: one layout, three experiences. `soon` actions are labels only.
export const HOME: Record<Intent, { heading: string; blurb: string; soon: string[] }> = {
  HAVE_ROOM: { heading: "Find the right person for your place", blurb: "Share your flat, then meet people who fit the way you live.", soon: ["Meet potential flatmates"] },
  TEAM_UP: { heading: "Find your people, then your place", blurb: "Team up with compatible people to rent a flat together.", soon: ["Discover compatible people", "Create a group"] },
  NEED_ROOM: { heading: "Find a room and people you can live with", blurb: "Look for a room in a shared flat with flatmates who fit.", soon: ["Browse available rooms", "Meet flatmates"] },
};

// Reusable, truthful notice: not a link, not a button, no fake counters.
export const ComingSoon = ({ label }: { label: string }) => (
  <div aria-disabled="true" className="flex items-center justify-between rounded-2xl border border-dashed border-hairline px-4 py-4">
    <span className="font-bold text-ink">{label}</span>
    <span className="text-xs text-muted"><span className="sr-only">, </span>Coming soon</span>
  </div>
);

export function HousingBlock({ housing, intent }: { housing: HousingSummary | null; intent: Intent }) {
  const have = intent === "HAVE_ROOM";
  const rows: [string, string][] = !housing ? [] : [
    ["City", housing.city?.label ?? "—"],
    [have ? "Flat locality" : "Preferred areas", housing.locationsFlexible ? `Any supported area in ${housing.city?.label ?? "the city"}` : housing.localities.map((l) => l.label).join(", ") || "—"],
    [have ? "Rent per person" : "Budget per person", have ? inr(housing.rentMinPaise) : `${inr(housing.rentMinPaise)} – ${inr(housing.rentMaxPaise)}`],
    [have ? "Available from" : "Move-in", housing.moveInFlexible ? "Flexible" : housing.moveInDate ?? "—"],
  ];
  return (
    <Card title="Your housing preferences" id="housing-h" icon="pin">
      {housing ? (
        <DetailRows rows={rows} />
      ) : <p className="mt-4 text-sm text-muted">Not available.</p>}
    </Card>
  );
}

// Real listing state only. Never "no listing" because of an error.
export function ListingBlock({ data }: { data: Pick<DashboardData, "listing" | "listingError"> }) {
  const l: ListingSummary | null = data.listing;
  if (data.listingError) {
    return (
      <Card title="Your flat listing" id="listing-h" icon="home">
        <p className="mt-3 text-xl font-bold">We couldn&apos;t load your listing</p>
        <p className="mt-2 text-sm text-muted">The rest of your dashboard still works.</p>
        <Link href="/dashboard" className={`${ghost} mt-4`}>Retry</Link>
      </Card>
    );
  }
  const heading = !l ? "Create Your Flat Listing" : { DRAFT: "Complete Your Flat Listing", PUBLISHED: "Your Flat Listing Is Live", PAUSED: "Your Flat Listing Is Paused", CLOSED: "Your Flat Listing Is Closed" }[l.status];
  return (
    <Card title="Your flat listing" id="listing-h" icon="home">
      <p className="mt-3 text-[22px] font-semibold tracking-[-0.01em] text-ink">{heading}</p>
      {!l && (
        <>
          <p className="mt-2 text-muted">Add photos, rent and location so potential flatmates can see your place. Your profile is ready; the listing stays private until you publish it.</p>
          <Link href="/dashboard/listing" className={`${cta} mt-5`}>Start your listing</Link>
        </>
      )}
      {l && (
        <>
          <p className="mt-4 text-base font-semibold text-ink">{STATUS_LABEL[l.status]}</p>
          {l.status === "PUBLISHED" && (
            <div className="mt-4 flex flex-wrap gap-4">
              {l.coverUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={l.coverUrl} alt="Cover photo of your flat" className="size-28 rounded-2xl object-cover" />
                : <div aria-hidden="true" className="flex size-28 items-center justify-center rounded-2xl bg-surface-card text-xs text-muted">No photo</div>}
              <div>
                <p className="text-lg font-bold">{l.title}</p>
                <p className="text-sm text-muted">{[l.locality, l.city].filter(Boolean).join(", ")}</p>
                <p className="mt-1">{inr(l.monthlyRentPaise)} per person / month</p>
              </div>
            </div>
          )}
          {l.status === "DRAFT" && l.missing.length > 0 && (
            <>
              <p className="mt-4 text-sm font-bold">Still needed</p>
              <ul className="mt-1 list-disc pl-5 text-sm">{l.missing.map((m) => <li key={m.field}>{m.message}</li>)}</ul>
            </>
          )}
          {l.status === "PAUSED" && <p className="mt-3 text-sm text-muted">Only you can see this. It&apos;s hidden from others until you review and publish it again.</p>}
          {l.status === "CLOSED" && <p className="mt-3 text-sm text-muted">Only you can see this. Reopen it from the listing page to edit and publish again.</p>}
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/dashboard/listing" className={cta}>{l.status === "DRAFT" ? "Continue your listing" : l.status === "PAUSED" ? "Review and republish" : l.status === "CLOSED" ? "View saved details" : "Manage listing"}</Link>
            {l.status === "PUBLISHED" && <Link href="/dashboard/profile#listing" className={ghost}>View on My Profile</Link>}
          </div>
        </>
      )}
    </Card>
  );
}
