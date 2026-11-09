"use client";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { Spinner } from "@/components/spinner";
import { ApiFail, api } from "@/lib/api";
import { detailHref, discoverHref, filtersFromQuery, type Filters, NO_FILTERS, safeQuery, toQuery } from "@/lib/discovery-filters";
import { useLocations } from "@/lib/locations";
import type { ActionRes, DiscoveryCard, DiscoveryRes } from "@/lib/matching-types";
import { cta, ghost, quiet } from "../dashboard/blocks";
import { btnBack, btnNext, inputCls } from "../onboarding/fields";
import { CardFacts, CoverPhoto, Score, Who } from "./card";
import { SafetyDialog } from "./safety";

type View = { k: "loading" } | { k: "error"; e: ApiFail } | { k: "ready"; cards: DiscoveryCard[]; empty: DiscoveryRes["empty"] };
const SWIPE_PX = 110;

export function Deck({ cityId }: { cityId: string | null }) {
  const { getToken } = useAuth();
  const { data: cat } = useLocations();
  const router = useRouter();
  // The URL is the single source of truth for applied filters, so View details and Back keep them.
  const searchParams = useSearchParams();
  const qs = safeQuery((k) => searchParams.get(k));
  const [draft, setDraft] = useState<Filters>(() => filtersFromQuery(qs));
  const [nonce, setNonce] = useState(0);
  const [view, setView] = useState<View>({ k: "loading" });
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState("");
  const [match, setMatch] = useState<string | null>(null);
  const [dx, setDx] = useState(0);
  const [safety, setSafety] = useState(false);
  const drag = useRef<{ x: number; id: number } | null>(null);

  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const r = await api<DiscoveryRes>(await getToken(), "GET", `/api/discovery${qs}`);
        if (!off) setView({ k: "ready", cards: r.cards, empty: r.empty });
      } catch (e) {
        if (!off) setView({ k: "error", e: e instanceof ApiFail ? e : new ApiFail(0, "NETWORK", "Something went wrong.") });
      }
    })();
    return () => { off = true; };
  }, [qs, nonce, getToken]);

  const reload = () => { setView({ k: "loading" }); setNonce((n) => n + 1); };
  const apply = (f: Filters) => {
    const next = toQuery(f);
    setDraft(f); setView({ k: "loading" });
    if (next === qs) setNonce((n) => n + 1); // same filters: just refresh the batch
    else router.replace(discoverHref(next), { scroll: false });
  };
  const cards = view.k === "ready" ? view.cards : [];
  const card = cards[0];
  const advance = () => {
    if (cards.length <= 1) return reload(); // queue finished and acknowledged: ask for a fresh batch
    setView({ k: "ready", cards: cards.slice(1), empty: null });
  };

  async function decide(kind: "LIKE" | "PASS") {
    if (!card || pending) return;
    setPending(true); setNote("");
    try {
      const r = await api<ActionRes>(await getToken(), "POST", "/api/discovery/actions", {
        publicId: card.publicId, kind, profileVersion: card.versions.profile, listingVersion: card.versions.listing,
      });
      if (kind === "LIKE" && r.matched) setMatch(card.displayName ?? "this person");
      else setNote(kind === "LIKE" ? "Interest saved. They only find out if they like you back." : "");
      advance();
    } catch (e) {
      const f = e instanceof ApiFail ? e : null;
      if (f?.code === "STALE_CANDIDATE") { setNote("That profile just changed. Showing the latest."); reload(); }
      else if (f?.status === 404) { setNote("That person is no longer available."); advance(); }
      else if (f?.code === "DECISION_CONFLICT") { setNote("You already decided on this person."); advance(); }
      else setNote(f?.message ?? "Couldn't save that. Try again."); // card stays; retrying repeats the same decision safely
    } finally {
      setDx(0); setPending(false);
    }
  }

  // Swipe is an extra: every action also has a labelled button and an arrow key.
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button,a,input,select,textarea,summary") || pending) return;
    drag.current = { x: e.clientX, id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => { if (drag.current) setDx(e.clientX - drag.current.x); };
  const onUp = () => {
    if (!drag.current) return;
    drag.current = null;
    if (dx > SWIPE_PX) void decide("LIKE");
    else if (dx < -SWIPE_PX) void decide("PASS");
    else setDx(0);
  };
  const onKey = (e: React.KeyboardEvent) => {
    // Arrow keys decide only when the card itself is focused, never from a link, button or field inside it.
    if ((e.target as HTMLElement).closest("a,button,input,select,textarea,summary")) return;
    if (e.key === "ArrowRight") { e.preventDefault(); void decide("LIKE"); }
    if (e.key === "ArrowLeft") { e.preventDefault(); void decide("PASS"); }
  };

  const city = cat?.cities.find((c) => c.id === cityId);
  const fieldErr = view.k === "error" ? view.e.fields : {};

  return (
    <div className="grid gap-6 lg:gap-4">
      <details className="rounded-2xl bg-white p-6 sm:p-8 lg:p-5" open={view.k === "error" && view.e.status === 422}>
        <summary className="flex cursor-pointer items-center gap-2 font-bold text-ink"><Icon name="search" className="size-5" />Filters{qs && " (on)"}</summary>
        <form className="mt-4 grid gap-6 lg:gap-4" onSubmit={(e) => { e.preventDefault(); apply(draft); }}>
          {city && (
            <fieldset>
              <legend className="font-bold">Areas in {city.label}</legend>
              <div className="mt-2 grid max-h-44 gap-1 overflow-auto sm:grid-cols-2">
                {city.localities.map((l) => (
                  <label key={l.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="size-4 accent-ink" checked={draft.localities.includes(l.id)}
                      onChange={() => setDraft({ ...draft, localities: draft.localities.includes(l.id) ? draft.localities.filter((x) => x !== l.id) : [...draft.localities, l.id] })} />
                    {l.label}
                  </label>
                ))}
              </div>
              {fieldErr.localities && <p className="mt-1 text-sm font-bold text-error">{fieldErr.localities}</p>}
            </fieldset>
          )}
          <div className="grid gap-4 sm:grid-cols-4">
            {([["rentMin", "Rent from (₹)", "text"], ["rentMax", "Rent up to (₹)", "text"], ["from", "Moving in from", "date"], ["to", "Moving in by", "date"]] as const).map(([k, l, t]) => (
              <div key={k}>
                <label htmlFor={`f-${k}`} className="block text-sm font-bold">{l}</label>
                <input id={`f-${k}`} type={t} inputMode={t === "text" ? "numeric" : undefined} value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} className={`${inputCls} mt-1`} />
                {(fieldErr[{ rentMin: "rentMinPaise", rentMax: "rentMaxPaise", from: "moveInFrom", to: "moveInTo" }[k]]) && <p className="mt-1 text-sm font-bold text-error">{fieldErr[{ rentMin: "rentMinPaise", rentMax: "rentMaxPaise", from: "moveInFrom", to: "moveInTo" }[k]]}</p>}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="submit" className={btnNext}>Apply filters</button>
            <button type="button" onClick={() => apply(NO_FILTERS)} className={btnBack}>Clear</button>
          </div>
        </form>
      </details>

      <div aria-live="polite" role="status" className={note ? "text-sm" : "sr-only"}>{note}</div>

      {match && (
        <section role="alert" className="overflow-hidden rounded-2xl bg-success-pale p-6 text-success sm:p-8 lg:p-5">
          <p className="flex items-center gap-2 text-sm font-bold"><Icon name="heart" className="size-5" />It&apos;s a match</p>
          <h2 className="mt-3 text-3xl font-bold tracking-[-0.02em]">You and {match} like each other.</h2>
          <p className="mt-2 opacity-90">Messaging is coming soon. You&apos;ll find them in Matches.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/dashboard/matches" className="inline-flex items-center justify-center rounded-2xl bg-white px-6 py-3 text-sm font-bold text-ink">See matches</Link>
            <button type="button" onClick={() => setMatch(null)} className={ghost}>Keep browsing</button>
          </div>
        </section>
      )}

      {view.k === "loading" && <div className="flex justify-center py-16"><Spinner label="Finding people" className="size-12" /></div>}

      {view.k === "error" && view.e.status !== 422 && <ErrorState e={view.e} retry={reload} />}

      {view.k === "ready" && !card && (
        <section className="rounded-2xl bg-white p-6 text-center sm:p-8 lg:p-5">
          <Icon name="users" className="mx-auto size-12 text-ink" />
          <h2 className="mt-4 text-[22px] font-semibold text-ink">{view.empty === "FILTERS" ? "No one matches these filters" : "No one new right now"}</h2>
          <p className="mx-auto mt-2 max-w-md text-muted">
            {view.empty === "FILTERS" ? "Try widening your areas, rent or dates." : "You've seen everyone who fits your preferences for now. Check back later, or review your preferences."}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {view.empty === "FILTERS" ? <button type="button" onClick={() => apply(NO_FILTERS)} className={cta}>Clear filters</button>
              : <><button type="button" onClick={reload} className={cta}>Check again</button><Link href="/dashboard/matching" className={ghost}>Matching preferences</Link></>}
          </div>
        </section>
      )}

      {card && (
        <div className="mx-auto w-full max-w-xl" onKeyDown={onKey}>
          <p className="mb-2 text-sm text-muted">{cards.length} in this batch. Use the buttons, swipe, or press the left and right arrow keys while the card is focused.</p>
          <article
            tabIndex={0} aria-label={`${card.displayName ?? "Profile"}, ${card.compatibility.score}% compatible`} aria-keyshortcuts="ArrowLeft ArrowRight"
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => { drag.current = null; setDx(0); }}
            style={dx ? { transform: `translateX(${dx}px) rotate(${dx / 30}deg)` } : undefined}
            className="relative touch-pan-y select-none overflow-hidden rounded-[32px] bg-white "
          >
            <CoverPhoto c={card} />
            <div className="grid gap-6 lg:gap-4 p-6 sm:p-8 lg:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3"><Who c={card} /><Score n={card.compatibility.score} /></div>
              {card.bio && <p className="whitespace-pre-wrap">{card.bio}</p>}
              <CardFacts c={card} />
              <Link href={detailHref(card.publicId, qs)} className={`${ghost} gap-2 justify-self-start`}>
                View details<span className="sr-only"> for {card.displayName ?? "this person"}</span><Icon name="arrow" className="size-4" />
              </Link>
            </div>
            {dx > 30 && <span aria-hidden="true" className="pointer-events-none absolute left-6 top-6 rounded-2xl border-4 border-ink px-3 py-1 text-[22px] font-semibold text-ink" style={{ opacity: Math.min(1, dx / SWIPE_PX) }}>LIKE</span>}
            {dx < -30 && <span aria-hidden="true" className="pointer-events-none absolute right-6 top-6 rounded-2xl border-4 border-hairline px-3 py-1 text-[22px] font-semibold text-ink" style={{ opacity: Math.min(1, -dx / SWIPE_PX) }}>PASS</span>}
          </article>
          <div className="mt-4 flex items-center justify-center gap-4">
            <button type="button" disabled={pending} onClick={() => void decide("PASS")} className={`${ghost} min-w-32 gap-2`}>
              <Icon name="close" className="size-4" />Pass
            </button>
            <button type="button" disabled={pending} onClick={() => void decide("LIKE")} className={`${cta} min-w-32 gap-2`}>
              <Icon name="heart" className="size-4" />Like
            </button>
          </div>
          <div className="mt-2 flex justify-center">
            <button type="button" onClick={() => setSafety(true)} className={quiet}><Icon name="shield" className="size-4" />Report or block</button>
          </div>
          {safety && (
            <SafetyDialog name={card.displayName ?? "this person"} publicId={card.publicId} onClose={() => setSafety(false)}
              onDone={(blocked) => { setSafety(false); setNote(blocked ? "Done. They won't appear again." : "Report sent. Thank you."); if (blocked) advance(); }} />
          )}
        </div>
      )}
    </div>
  );
}

function ErrorState({ e, retry }: { e: ApiFail; retry: () => void }) {
  const setup = ["NOT_ENROLLED", "MATCHING_NOT_READY"].includes(e.code);
  return (
    <section role="alert" className="rounded-2xl bg-white p-6 sm:p-8 lg:p-5">
      <h2 className="text-[22px] font-semibold text-ink">
        {setup ? "Finish your matching preferences" : e.code === "NO_ELIGIBLE_FLAT" ? "Publish your flat first" : e.status === 0 ? "You seem to be offline" : "We couldn't load people"}
      </h2>
      <p className="mt-2 text-muted">{e.message}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        {setup && <Link href="/dashboard/matching" className={cta}>Set up matching</Link>}
        {e.code === "NO_ELIGIBLE_FLAT" && <Link href="/dashboard/listing" className={cta}>Go to my listing</Link>}
        {!setup && e.code !== "NO_ELIGIBLE_FLAT" && <button type="button" onClick={retry} className={cta}>Try again</button>}
      </div>
    </section>
  );
}
