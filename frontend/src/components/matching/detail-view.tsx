import Link from "next/link";
import { Icon } from "@/components/icons";
import { INTENT_LABEL } from "@/lib/dashboard-types";
import { discoverHref } from "@/lib/discovery-filters";
import { inr } from "@/lib/format";
import { FURNISHING, ROOM_TYPES } from "@/lib/listing-types";
import type { DiscoveryDetail } from "@/lib/matching-types";
import { CLEAN, FOOD, GUESTS, label, OCCUPATIONS, SLEEP, SMOKE, WORK } from "@/lib/onboarding-types";
import { Card, ghost } from "../dashboard/blocks";
import { DetailRows } from "../dashboard/detail-rows";
import { FlatPhoto } from "../dashboard/flat-photo";
import { Initials } from "../onboarding/fields";
import { CardFacts, Score } from "./card";

const when = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Plain navigation: never a decision. `qs` is the already-sanitized filter context. */
export const BackToDiscover = ({ qs = "" }: { qs?: string }) => (
  <Link href={discoverHref(qs)} className={`${ghost} gap-2`}><Icon name="arrow" className="size-4 rotate-180" />Back to Discover</Link>
);

// Current, permission-checked data only. Like and Pass stay on the Discover deck; `footer` carries Report or block.
export function DiscoveryDetailView({ d, qs, footer }: { d: DiscoveryDetail; qs: string; footer?: React.ReactNode }) {
  const l = d.lifestyle, f = d.flat;
  const photos = f ? [...f.photos].sort((a, b) => Number(b.id === f.coverPhotoId) - Number(a.id === f.coverPhotoId)) : [];
  return (
    <div className="grid gap-6 lg:gap-4">
      <div><BackToDiscover qs={qs} /></div>

      <Card>
        <div className="flex flex-wrap items-center gap-4">
          {d.avatarUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={d.avatarUrl} alt="" className="size-20 shrink-0 rounded-full object-cover" />
            : <Initials name={d.displayName ?? ""} className="size-20" />}
          <div className="min-w-0">
            <h1 className="text-[28px] font-bold leading-[1.2] tracking-[-1.2px] text-ink">{[d.displayName, d.age].filter((x) => x != null).join(", ")}</h1>
            <p className="mt-2 text-sm text-muted">
              {[label(OCCUPATIONS, d.occupation), d.city?.label].filter((x) => x && x !== "—").join(" · ")}
            </p>
            <p className="mt-1 text-sm font-bold">{INTENT_LABEL[d.intent]}</p>
          </div>
          <div className="sm:ml-auto"><Score n={d.compatibility.score} /></div>
        </div>
        {d.bio && <p className="mt-4 whitespace-pre-wrap">{d.bio}</p>}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2 lg:gap-4">
        <Card title="Lifestyle" id="life-h" icon="moon">
          <DetailRows rows={[
            ["Awake", label(SLEEP, l.sleepSchedule)], ["Tidiness", label(CLEAN, l.cleanliness)], ["Food", label(FOOD, l.foodHabit)], ["Smoking", label(SMOKE, l.smokingHabit)],
            ["Guests", label(GUESTS, l.guestFrequency)], ["Work or study", label(WORK, l.workStudySchedule)], ["Has a pet", l.bringingPet ? "Yes" : "No"],
          ]} />
        </Card>

        {!f && (
          <Card title="Looking for" id="seek-h" icon="pin">
            <div className="mt-4"><CardFacts c={{ city: d.city, seeking: d.seeking }} /></div>
          </Card>
        )}

        {f && (
          <Card title="Flat available" id="flat-h" icon="home">
            <p className="mt-3 text-sm text-muted">Self-reported by the owner. Flatter doesn&apos;t verify flats or ownership.</p>
            <p className="mt-4 text-[22px] font-semibold leading-[1.25]">{f.title}</p>
            <p className="text-sm text-muted">{[f.locality.label, f.city.label].filter(Boolean).join(", ")}</p>
            <DetailRows rows={[
              ["Rent", `${inr(f.monthlyRentPaise)} per person / month`], ["Deposit", inr(f.depositPaise)],
              ["Room", label(ROOM_TYPES, f.roomType)], ["Furnishing", label(FURNISHING, f.furnishing)],
              ["Flat size", f.bedrooms ? `${f.bedrooms} bedroom` : "—"], ["Places available", f.availablePlaces ? String(f.availablePlaces) : "—"],
              ["Availability", f.availableFlexible ? "Flexible" : f.availableFrom ? `From ${when(f.availableFrom)}` : "—"],
              ...(f.chargesNote ? [["Charges", f.chargesNote] as [string, string]] : []),
            ]} />
          </Card>
        )}
      </div>

      {f && (
        <Card title="About the flat" id="about-flat-h" icon="image">
          {f.description && <p className="mt-4 whitespace-pre-wrap">{f.description}</p>}
          {photos.length > 0 ? (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {photos.map((p, i) => <li key={p.id}><FlatPhoto src={p.url} alt={`Photo ${i + 1} of ${f.title ?? "the flat"}`} className="aspect-4/3 w-full" /></li>)}
            </ul>
          ) : <p className="mt-4 text-sm text-muted">No photos to show.</p>}
        </Card>
      )}

      {footer}
    </div>
  );
}
