"use client";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { ApiFail, api } from "@/lib/api";
import { INTENT_LABEL } from "@/lib/dashboard-types";
import type { MatchItem } from "@/lib/matching-types";
import { Card, cta, ghost, quiet } from "../dashboard/blocks";
import { Who } from "./card";
import { SafetyDialog } from "./safety";

interface Blocked { publicId: string; displayName: string | null; avatarUrl: string | null }

export function MatchesList({ initial, blocked: initialBlocked }: { initial: MatchItem[]; blocked: Blocked[] }) {
  const { getToken } = useAuth();
  const [items, setItems] = useState(initial);
  const [blocked, setBlocked] = useState(initialBlocked);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [safety, setSafety] = useState<MatchItem | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(fn: (t: string | null) => Promise<void>, ok: string) {
    setBusy(true); setNote("");
    try { await fn(await getToken()); setNote(ok); }
    catch (e) { setNote(e instanceof ApiFail ? e.message : "Something went wrong."); }
    finally { setBusy(false); }
  }

  return (
    <div className="grid gap-6 lg:gap-4">
      <div>
        <h1 className="text-[28px] font-bold leading-[1.2] tracking-[-1.2px] text-ink">Matches</h1>
        <p className="mt-3 text-muted">People who liked you back. Only the two of you can see this.</p>
      </div>
      <div aria-live="polite" className={note ? "text-sm" : "sr-only"}>{note}</div>

      {items.length === 0 ? (
        <Card>
          <div className="py-6 text-center">
            <Icon name="heart" className="mx-auto size-12 text-ink" />
            <h2 className="mt-4 text-[22px] font-semibold text-ink">No matches yet</h2>
            <p className="mx-auto mt-2 max-w-md text-muted">When you and someone else both like each other, they show up here.</p>
            <Link href="/dashboard/discover" className={`${cta} mt-6`}>Discover people</Link>
          </div>
        </Card>
      ) : (
        <ul className="grid gap-6 lg:gap-4 lg:grid-cols-2">
          {items.map((m) => (
            <li key={m.id}>
              <Card>
                <Who c={{ ...m.person, occupation: null }} />
                <p className="mt-3 text-sm text-muted">{INTENT_LABEL[m.person.intent]} · Matched {new Date(m.matchedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</p>
                <p className="mt-4 inline-flex items-center gap-2 text-sm text-ink"><Icon name="message" className="size-4" />{m.chat.reason}</p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link href={`/profiles/${m.person.publicId}`} className={cta}>View profile</Link>
                  {confirm === m.id ? (
                    <>
                      <button type="button" disabled={busy} className={ghost} onClick={() => run(async (t) => { await api(t, "POST", `/api/matches/${m.id}/unmatch`); setItems((x) => x.filter((y) => y.id !== m.id)); setConfirm(null); }, "Unmatched.")}>Confirm unmatch</button>
                      <button type="button" className={ghost} onClick={() => setConfirm(null)}>Cancel</button>
                    </>
                  ) : <button type="button" className={ghost} onClick={() => setConfirm(m.id)}>Unmatch</button>}
                  <button type="button" onClick={() => setSafety(m)} className={quiet}><Icon name="shield" className="size-4" />Report or block</button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {blocked.length > 0 && (
        <Card title="People you blocked" id="blocked-h" icon="shield">
          <p className="mt-3 text-sm text-muted">Unblocking lets you see each other&apos;s profiles again. It doesn&apos;t restore matches, likes or chat.</p>
          <ul className="mt-4 grid gap-3">
            {blocked.map((b) => (
              <li key={b.publicId} className="flex items-center justify-between gap-3">
                <span className="font-bold">{b.displayName}</span>
                <button type="button" disabled={busy} className={ghost} onClick={() => run(async (t) => { await api(t, "DELETE", `/api/blocks/${b.publicId}`); setBlocked((x) => x.filter((y) => y.publicId !== b.publicId)); }, "Unblocked.")}>Unblock</button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {safety && (
        <SafetyDialog name={safety.person.displayName ?? "this person"} publicId={safety.person.publicId} matchId={safety.id} onClose={() => setSafety(null)}
          onDone={(didBlock) => {
            if (didBlock) {
              setItems((x) => x.filter((y) => y.id !== safety.id));
              setBlocked((x) => [...x, { publicId: safety.person.publicId, displayName: safety.person.displayName, avatarUrl: safety.person.avatarUrl }]);
            }
            setNote(didBlock ? "Done. This match has ended." : "Report sent. Thank you.");
            setSafety(null);
          }} />
      )}
    </div>
  );
}
