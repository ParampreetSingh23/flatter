"use client";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { Spinner } from "@/components/spinner";
import { ApiFail, api } from "@/lib/api";
import type { Inbox as InboxData, InboxItem } from "@/lib/chat-types";
import { cta, ghost } from "../dashboard/blocks";
import { Initials } from "../onboarding/fields";
import { useChat } from "./chat-provider";
import { shortWhen } from "./format";

export const PeerAvatar = ({ name, src, size = "size-12" }: { name: string | null; src: string | null; size?: string }) =>
  src
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={src} alt="" className={`${size} shrink-0 rounded-full object-cover`} />
    : <Initials name={name ?? ""} className={size} />;

const stateLabel = { ACTIVE: "", READ_ONLY: "Ended", UNAVAILABLE: "Unavailable" } as const;

export function InboxList() {
  const { getToken } = useAuth();
  const { subscribe } = useChat();
  const path = usePathname();
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const sizeRef = useRef(30);

  // Reloads the first pages (as many as are showing) so live changes and paging never fight.
  const load = useCallback(async () => {
    try {
      const r = await api<InboxData>(await getToken(), "GET", `/api/messages?limit=${Math.min(50, Math.max(30, sizeRef.current))}`);
      setItems(r.conversations); setNext(r.nextCursor); setError(null);
    } catch (e) {
      setError(e instanceof ApiFail ? e.message : "Couldn't load your conversations.");
    }
  }, [getToken]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const off = subscribe((e) => {
      if (["message:created", "receipt:updated", "inbox:changed", "conversation:closed", "reconcile"].includes(e.name)) { clearTimeout(t); t = setTimeout(() => void load(), 400); }
    });
    return () => { off(); clearTimeout(t); };
  }, [subscribe, load]);

  async function loadMore() {
    if (!next) return;
    setMore(true);
    try {
      const r = await api<InboxData>(await getToken(), "GET", `/api/messages?limit=30&cursor=${encodeURIComponent(next)}`);
      setItems((cur) => [...(cur ?? []), ...r.conversations.filter((c) => !cur?.some((x) => x.id === c.id))]);
      sizeRef.current = (items?.length ?? 0) + r.conversations.length;
      setNext(r.nextCursor);
    } catch (e) { setError(e instanceof ApiFail ? e.message : "Couldn't load more."); }
    finally { setMore(false); }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-2xl bg-white">
      <h1 className="px-5 pb-3 pt-5 text-[28px] font-bold leading-[1.2] tracking-[-1.2px] text-ink">Messages</h1>
      {items === null && !error && <div className="flex justify-center py-10"><Spinner label="Loading conversations" className="size-8" /></div>}
      {error && (
        <div role="alert" className="px-5 pb-4">
          <p className="text-sm font-bold text-error">{error}</p>
          <button type="button" onClick={() => void load()} className={`${ghost} mt-3`}>Retry</button>
        </div>
      )}
      {items && items.length === 0 && (
        <div className="px-5 pb-6 text-center">
          <Icon name="message" className="mx-auto size-10 text-ink" />
          <h2 className="mt-3 text-lg font-semibold">No conversations yet</h2>
          <p className="mt-1 text-sm text-muted">When you and someone else like each other, you can chat here.</p>
          <Link href="/dashboard/discover" className={`${cta} mt-4`}>Discover people</Link>
        </div>
      )}
      {items && items.length > 0 && (
        <ul className="min-h-0 flex-1 overflow-y-auto" aria-label="Conversations">
          {items.map((c) => {
            const active = path === `/dashboard/messages/${c.id}`;
            const name = c.peer.displayName ?? "Match";
            return (
              <li key={c.id}>
                <Link href={`/dashboard/messages/${c.id}`} aria-current={active ? "page" : undefined}
                  className={`flex min-h-16 items-center gap-3 px-5 py-3 hover:bg-surface-card ${active ? "bg-surface-card" : ""}`}>
                  <PeerAvatar name={c.peer.displayName} src={c.peer.avatarUrl} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={`truncate ${c.unread ? "font-bold" : "font-semibold"}`}>{name}</span>
                      <span className="shrink-0 text-xs text-muted">{shortWhen(c.last?.createdAt ?? c.matchedAt)}</span>
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2">
                      <span className={`truncate text-sm ${c.unread ? "text-ink" : "text-muted"}`}>
                        {c.last ? `${c.last.mine ? "You: " : ""}${c.last.body}` : c.state === "ACTIVE" ? "Say hello" : "No messages"}
                      </span>
                      {c.unread > 0 && (
                        <span className="inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-white">
                          {c.unread > 99 ? "99+" : c.unread}<span className="sr-only"> unread messages</span>
                        </span>
                      )}
                      {c.state !== "ACTIVE" && <span className="shrink-0 text-xs text-muted">{stateLabel[c.state]}</span>}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {next && (
        <div className="border-t border-hairline p-3">
          <button type="button" disabled={more} onClick={() => void loadMore()} className={`${ghost} w-full`}>{more ? "Loading…" : "Load more"}</button>
        </div>
      )}
    </div>
  );
}
