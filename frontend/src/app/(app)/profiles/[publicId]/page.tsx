import type { Metadata } from "next";
import { PageSpinner } from "@/components/spinner";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Card, cta, ghost } from "@/components/dashboard/blocks";
import { FlatPhoto } from "@/components/dashboard/flat-photo";
import { Icon } from "@/components/icons";
import { ViewerSafety } from "@/components/matching/viewer-safety";
import { Initials } from "@/components/onboarding/fields";
import { DetailRows } from "@/components/dashboard/detail-rows";
import { ApiFail } from "@/lib/api";
import { INTENT_LABEL, type ViewerData } from "@/lib/dashboard-types";
import { inr } from "@/lib/format";
import { CLEAN, FOOD, GENDERS, GUESTS, label, OCCUPATIONS, SLEEP, SMOKE } from "@/lib/onboarding-types";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Profile — Flatter", robots: { index: false } };

export default function ViewerPage({ params }: { params: Promise<{ publicId: string }> }) {
  return (
    <div className="mx-auto max-w-4xl lg:max-w-none">
      <Suspense fallback={<PageSpinner label="Loading profile" />}>
        <Content params={params} />
      </Suspense>
    </div>
  );
}

const ROOM = { PRIVATE: "Private room", SHARED: "Shared room" } as const;
const FURN = { UNFURNISHED: "Unfurnished", SEMI_FURNISHED: "Semi-furnished", FURNISHED: "Furnished" } as const;

async function Content({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  let v: ViewerData;
  try {
    v = await serverGet<ViewerData>(`/api/profiles/${encodeURIComponent(publicId)}`);
  } catch (e) {
    if (e instanceof ApiFail && e.status === 404) notFound(); // also covers profiles that aren't visible to you
    if (e instanceof ApiFail && e.status === 403) redirect("/auth/continue");
    return (
      <Card>
        <h1 className="text-[28px] font-bold leading-[1.2] tracking-[-1.2px] text-ink">We couldn&apos;t load this profile.</h1>
        <p className="mt-4">{e instanceof ApiFail ? e.message : "Something went wrong."} This is temporary.</p>
        <Link href={`/profiles/${publicId}`} className={`${cta} mt-6`}>Retry</Link>
      </Card>
    );
  }
  const p = v.profile, l = v.lifestyle, f = v.flat;
  const hasMore = p.occupation !== undefined; // full safe profile vs publisher-only view
  return (
    <div className="grid gap-6 lg:gap-4">
      {v.isOwner && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-card p-4 text-sm">
          <p>{v.ownerNote ?? "This is how other signed-in users see your profile."}</p>
          <Link href="/dashboard/profile" className={`${ghost} gap-2`}><Icon name="arrow" className="size-4 rotate-180" />Back to My Profile</Link>
        </div>
      )}
      <Card>
        <div className="flex flex-wrap items-center gap-4">
          {p.avatarUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={p.avatarUrl} alt={`${p.displayName ?? "Member"}'s photo`} className="size-20 rounded-full object-cover" />
            : <Initials name={p.displayName ?? ""} className="size-20" />}
          <div>
            <h1 className="text-[28px] font-bold leading-[1.2] tracking-[-1.2px] text-ink">{p.displayName}</h1>
            {hasMore && (
              <p className="mt-2 text-sm text-muted">
                {[p.age != null && `${p.age} years old`, label(OCCUPATIONS, p.occupation), p.gender && label(GENDERS, p.gender), v.city?.label].filter((x) => x && x !== "—").join(" · ")}
              </p>
            )}
            {hasMore && v.intent && <p className="mt-1 text-sm font-bold">{INTENT_LABEL[v.intent]}</p>}
          </div>
        </div>
        {p.bio && <p className="mt-4 whitespace-pre-wrap">{p.bio}</p>}
      </Card>

      {hasMore && l && (
        <Card title="Lifestyle" id="life-h">
          <DetailRows rows={[
            ["Awake", label(SLEEP, l.sleepSchedule)], ["Tidiness", label(CLEAN, l.cleanliness)], ["Food", label(FOOD, l.foodHabit)], ["Smoking", label(SMOKE, l.smokingHabit)],
            ["Has a pet", l.bringingPet == null ? "—" : l.bringingPet ? "Yes" : "No"], ["Guests", label(GUESTS, l.guestFrequency)],
          ]} />
        </Card>
      )}

      {f && (
        <Card title="Flat available" id="flat-h">
          <p className="mt-3 text-sm text-muted">Self-reported by the owner. Flatter doesn&apos;t verify flats or ownership.</p>
          {(() => {
            const ph = f.photos.find((x) => x.id === f.coverPhotoId) ?? f.photos[0];
            return ph ? <FlatPhoto src={ph.url} alt={`Cover photo: ${f.title ?? "flat"}`} className="mt-4 aspect-4/3 w-full" /> : null;
          })()}
          <p className="mt-4 text-[22px] font-semibold">{f.title}</p>
          <p className="text-sm text-muted">{[f.locality.label, f.city.label].filter(Boolean).join(", ")}</p>
          <p className="mt-2 text-lg">{inr(f.monthlyRentPaise)} per person / month <span className="text-sm text-muted">· deposit {inr(f.depositPaise)}</span></p>
          <p className="mt-2 text-sm">{[f.roomType && ROOM[f.roomType as keyof typeof ROOM], f.furnishing && FURN[f.furnishing as keyof typeof FURN], f.bedrooms && `${f.bedrooms} bedroom flat`, f.availablePlaces && `${f.availablePlaces} place(s) available`].filter(Boolean).join(" · ")}</p>
          <p className="mt-1 text-sm">{f.availableFlexible ? "Available: flexible" : f.availableFrom ? `Available from ${f.availableFrom}` : ""}</p>
          <details className="mt-4">
            <summary className="cursor-pointer font-bold">More details and photos</summary>
            <div className="mt-3 grid gap-3 text-sm">
              {f.description && <p className="whitespace-pre-wrap">{f.description}</p>}
              {f.chargesNote && <p><span className="font-bold">Charges:</span> {f.chargesNote}</p>}
              <p className="text-muted">Amenities not provided.</p>
              {f.photos.length > 0 && (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {f.photos.map((x, i) => <li key={x.id}><FlatPhoto src={x.url} alt={`Photo ${i + 1} of the flat`} className="aspect-4/3 w-full" /></li>)}
                </ul>
              )}
            </div>
          </details>
        </Card>
      )}
      <p><Link href="/dashboard" className={ghost}>Back to dashboard</Link></p>
      {!v.isOwner && <ViewerSafety publicId={publicId} name={p.displayName ?? "this person"} />}
    </div>
  );
}
