"use client";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/icons";
import { Spinner } from "@/components/spinner";
import { ApiFail, api } from "@/lib/api";
import { type ChatEvent, type ChatMessage, type ConvState, type HistoryPage, MAX_CODEPOINTS, normalizeBody, type Snapshot } from "@/lib/chat-types";
import { Card, cta, ghost, quiet, small } from "../dashboard/blocks";
import { SafetyDialog } from "../matching/safety";
import { useChat } from "./chat-provider";
import { dayOf, timeOf } from "./format";
import { PeerAvatar } from "./inbox";

type Pending = { clientId: string; body: string; status: "queued" | "sending" | "failed"; attempts: number; error?: string };
type View = { k: "loading" } | { k: "error"; message: string } | { k: "gone" } | { k: "ready" };
const MAX_RETRIES = 3;
const MAX_REPORT = 10;

// Focus/visibility drive "read": a background tab or an unfocused window never marks anything read.
const subscribeFocus = (cb: () => void) => {
  window.addEventListener("focus", cb); window.addEventListener("blur", cb); document.addEventListener("visibilitychange", cb);
  return () => { window.removeEventListener("focus", cb); window.removeEventListener("blur", cb); document.removeEventListener("visibilitychange", cb); };
};
const isFocused = () => document.visibilityState === "visible" && document.hasFocus();

export function Thread({ matchId }: { matchId: string }) {
  const { getToken } = useAuth();
  const chat = useChat();
  const focused = useSyncExternalStore(subscribeFocus, isFocused, () => false);

  const [view, setView] = useState<View>({ k: "loading" });
  const [snap, setSnap] = useState<Omit<Snapshot, "messages" | "hasMore"> | null>(null);
  const [msgs, setMsgsState] = useState<ChatMessage[]>([]);
  const [pending, setPendingState] = useState<Pending[]>([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [newCount, setNewCount] = useState(0);
  const [peerTyping, setPeerTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftErr, setDraftErr] = useState("");
  const [announce, setAnnounce] = useState({ n: 0, text: "" });
  const [stale, setStale] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [safety, setSafety] = useState<"general" | "evidence" | null>(null);
  const [confirmUnmatch, setConfirmUnmatch] = useState(false);
  const [note, setNote] = useState("");
  const [attempt, setAttempt] = useState(0);

  // Message list and send queue live in refs too, so async handlers never act on a stale render.
  const msgsRef = useRef<ChatMessage[]>([]);
  const pendingRef = useRef<Pending[]>([]);
  const setMsgs = (next: ChatMessage[]) => { msgsRef.current = next; setMsgsState(next); };
  const setPending = (next: Pending[]) => { pendingRef.current = next; setPendingState(next); };
  const stateRef = useRef<ConvState>("ACTIVE");
  const onlineRef = useRef(false);
  const hydrated = useRef(false);
  const buffer = useRef<ChatEvent[]>([]);
  const inflight = useRef(false);
  const catching = useRef(false);
  const catchAgain = useRef(false);
  const stick = useRef(true);
  const anchor = useRef<number | null>(null);
  const sent = useRef({ delivered: 0, read: 0 });
  const typingAt = useRef(0);
  const typingActive = useRef(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const listRef = useRef<HTMLDivElement>(null);
  const [online, state] = [chat.status === "online", snap?.state ?? "ACTIVE"];
  useEffect(() => { onlineRef.current = online; stateRef.current = state; }, [online, state]);

  const apiGet = useCallback(async <T,>(path: string) => api<T>(await getToken(), "GET", path), [getToken]);

  // ---- messages: contiguous by seq; duplicates ignored; a gap triggers catch-up, never a guess ----
  const applyMessage = useCallback((m: ChatMessage, announceIt: boolean) => {
    const cur = msgsRef.current, tail = cur.at(-1)?.seq ?? 0;
    if (m.seq <= tail) return;
    if (m.seq !== tail + 1) { void catchUp(); return; }
    setMsgs([...cur, m]);
    if (!m.mine && announceIt) {
      if (!stick.current) setNewCount((n) => n + 1);
      setAnnounce((a) => ({ n: a.n + 1, text: "New message" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyMeta = useCallback((s: Omit<Snapshot, "messages" | "hasMore">) => { setSnap(s); stateRef.current = s.state; }, []);

  const catchUp = useCallback(async () => {
    if (catching.current) { catchAgain.current = true; return; }
    catching.current = true;
    try {
      for (;;) {
        const tail = msgsRef.current.at(-1)?.seq ?? 0;
        const r = await apiGet<HistoryPage>(`/api/messages/${matchId}/history?afterSeq=${tail}&limit=100`);
        for (const m of r.messages) applyMessage(m, true);
        setSnap((s) => (s ? { ...s, state: r.state, headSeq: r.headSeq } : s));
        stateRef.current = r.state;
        if (!r.hasMore) break;
      }
      setStale(false);
    } catch (e) {
      if (e instanceof ApiFail && e.status === 404) setView({ k: "gone" }); else setStale(true);
    } finally {
      catching.current = false;
      if (catchAgain.current) { catchAgain.current = false; void catchUp(); }
    }
  }, [apiGet, applyMessage, matchId]);

  // Authoritative metadata (state, cursors, head) plus any messages we missed.
  const reloadMeta = useCallback(async () => {
    try {
      const { messages: _m, hasMore: _h, ...meta } = await apiGet<Snapshot>(`/api/messages/${matchId}`);
      void _m; void _h;
      applyMeta(meta);
      if (meta.headSeq > (msgsRef.current.at(-1)?.seq ?? 0)) void catchUp();
      setStale(false);
      if (meta.state !== "ACTIVE") {
        // Closed: nothing pending can ever be delivered; stop typing and freeze receipts.
        setPending(pendingRef.current.map((p) => (p.status === "failed" ? p : { ...p, status: "failed", error: "This conversation has ended." })));
        setPeerTyping(false);
      }
    } catch (e) {
      if (e instanceof ApiFail && e.status === 404) setView({ k: "gone" }); else setStale(true);
    }
  }, [apiGet, applyMeta, catchUp, matchId]);

  const handle = useCallback((e: ChatEvent) => {
    const d = e.data as Record<string, unknown>;
    if (e.name === "reconcile") return void reloadMeta();
    if (d.matchId !== matchId) return;
    if (e.name === "message:created") {
      const m = d as unknown as ChatMessage;
      if (m.mine && m.clientMessageId) setPending(pendingRef.current.filter((p) => p.clientId !== m.clientMessageId));
      if (!m.mine) setPeerTyping(false);
      applyMessage(m, true);
    } else if (e.name === "receipt:updated") {
      const w = d.who === "me" ? "me" : "peer", delivered = d.delivered as number, read = d.read as number;
      setSnap((s) => s && { ...s, cursors: { ...s.cursors, [w]: { delivered: Math.max(s.cursors[w].delivered, delivered), read: Math.max(s.cursors[w].read, read) } } });
    } else if (e.name === "typing:changed") {
      setPeerTyping(d.active === true);
      clearTimeout(typingTimer.current);
      if (d.active === true) typingTimer.current = setTimeout(() => setPeerTyping(false), 6000); // local expiry too
    } else if (e.name === "conversation:closed") void reloadMeta();
  }, [applyMessage, matchId, reloadMeta]);

  // Subscribe first (buffering), then load the snapshot, then replay what arrived meanwhile.
  useEffect(() => chat.subscribe((e) => { if (hydrated.current) handle(e); else buffer.current.push(e); }), [chat, handle]);
  const status = chat.status;
  useEffect(() => {
    if (hydrated.current) return;
    let off = false;
    const start = async () => {
      try {
        const s = await apiGet<Snapshot>(`/api/messages/${matchId}`);
        if (off) return;
        const { messages, hasMore, ...meta } = s;
        applyMeta(meta); setMsgs(messages); setHasOlder(hasMore);
        hydrated.current = true; stick.current = true; setView({ k: "ready" });
        for (const e of buffer.current.splice(0)) handle(e);
      } catch (e) {
        if (off) return;
        setView(e instanceof ApiFail && e.status === 404 ? { k: "gone" } : { k: "error", message: e instanceof ApiFail ? e.message : "Couldn't load this conversation." });
      }
    };
    // Prefer an authenticated socket first; don't wait forever if it can't connect.
    const t = setTimeout(start, status === "connecting" ? 2500 : 0);
    return () => { off = true; clearTimeout(t); };
  }, [status, attempt, apiGet, applyMeta, handle, matchId]);

  // ---- sending: one in flight, FIFO, same client id on every retry ----
  const pump = useCallback(async () => {
    if (inflight.current) return;
    const first = pendingRef.current[0];
    if (!first || first.status !== "queued" || !onlineRef.current || stateRef.current !== "ACTIVE") return;
    inflight.current = true;
    const patch = (p: Partial<Pending>) => setPending(pendingRef.current.map((x) => (x.clientId === first.clientId ? { ...x, ...p } : x)));
    patch({ status: "sending" });
    const r = await chat.request<{ message: ChatMessage }>("message:send", { matchId, clientMessageId: first.clientId, body: first.body }, 10_000);
    inflight.current = false;
    if (r.ok) {
      setPending(pendingRef.current.filter((x) => x.clientId !== first.clientId));
      stick.current = true;
      applyMessage(r.message, false);
    } else {
      const code = r.error.code;
      if (["TIMEOUT", "OFFLINE", "UNAVAILABLE"].includes(code) && (code === "OFFLINE" || first.attempts + 1 < MAX_RETRIES)) {
        // Uncertain delivery: retry the SAME id; the server returns the original if it had committed.
        patch({ status: "queued", attempts: code === "OFFLINE" ? first.attempts : first.attempts + 1 });
        if (code !== "OFFLINE") setTimeout(() => void pump(), 800 * (first.attempts + 1));
        return;
      }
      patch({
        status: "failed",
        error: code === "CONVERSATION_CLOSED" ? "This conversation has ended." : code === "RATE_LIMITED" ? "You're sending too fast. Wait a moment, then retry."
          : code === "VALIDATION_ERROR" ? (r.error.message ?? "This message can't be sent.") : "Couldn't send. Check your connection and retry.",
      });
      if (code === "CONVERSATION_CLOSED") void reloadMeta();
      return;
    }
    void pump();
  }, [applyMessage, chat, matchId, reloadMeta]);
  useEffect(() => { if (online && view.k === "ready") void pump(); }, [online, view.k, pump]);

  function submit() {
    const n = normalizeBody(draft);
    if (!n.ok) return setDraftErr(n.message);
    setDraftErr("");
    setPending([...pendingRef.current, { clientId: crypto.randomUUID(), body: n.body, status: "queued", attempts: 0 }]);
    setDraft(""); setTyping(false);
    void pump();
  }
  const retry = (id: string) => { setPending(pendingRef.current.map((p) => (p.clientId === id ? { ...p, status: "queued", attempts: 0 } : p))); void pump(); };
  const discard = (id: string) => setPending(pendingRef.current.filter((p) => p.clientId !== id));

  // ---- typing: at most one signal per 2 s while composing; stops on send, blur and unmount ----
  const setTyping = useCallback((active: boolean) => {
    if (active === typingActive.current && (!active || Date.now() - typingAt.current < 2000)) return;
    if (!active && !typingActive.current) return;
    typingActive.current = active; typingAt.current = Date.now();
    void chat.request("typing:set", { matchId, active }, 5000);
  }, [chat, matchId]);
  useEffect(() => () => { if (typingActive.current) void chat.request("typing:set", { matchId, active: false }, 2000); }, [chat, matchId]);

  // ---- receipts: delivered when messages reach this client; read only when visible, focused and at the latest ----
  const tail = msgs.at(-1)?.seq ?? 0;
  const incomingMax = msgs.reduce((m, x) => (x.mine ? m : Math.max(m, x.seq)), 0);
  const cur = snap?.cursors.me;
  useEffect(() => {
    if (!snap || snap.state !== "ACTIVE" || !online || !cur) return;
    if (incomingMax > cur.delivered && incomingMax > sent.current.delivered) {
      sent.current.delivered = incomingMax;
      void chat.request("message:delivered", { matchId, throughSeq: incomingMax }).then((r) => { if (!r.ok) sent.current.delivered = 0; });
    }
    if (focused && atBottom && tail > cur.read && tail > sent.current.read) {
      sent.current.read = tail;
      void chat.request("message:read", { matchId, throughSeq: tail }).then((r) => { if (!r.ok) sent.current.read = 0; });
    }
  }, [snap, online, cur, incomingMax, tail, focused, atBottom, chat, matchId]);

  // ---- scrolling: follow the bottom only when already there; older pages keep the reader's place ----
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (anchor.current !== null) { el.scrollTop += el.scrollHeight - anchor.current; anchor.current = null; }
    else if (stick.current) el.scrollTop = el.scrollHeight;
  }, [msgs, pending.length, view.k]);
  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stick.current = near; setAtBottom(near);
    if (near) setNewCount(0);
  };
  const toBottom = () => { stick.current = true; setNewCount(0); const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; };

  async function loadOlder() {
    const first = msgsRef.current[0];
    if (!first || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const r = await apiGet<HistoryPage>(`/api/messages/${matchId}/history?beforeSeq=${first.seq}&limit=50`);
      anchor.current = listRef.current?.scrollHeight ?? null;
      setMsgs([...r.messages.filter((m) => m.seq < first.seq), ...msgsRef.current]);
      setHasOlder(r.hasMore);
    } catch { setNote("Couldn't load earlier messages. Try again."); }
    finally { setLoadingOlder(false); }
  }

  async function unmatch() {
    try { await api(await getToken(), "POST", `/api/matches/${matchId}/unmatch`); setConfirmUnmatch(false); await reloadMeta(); }
    catch (e) { setNote(e instanceof ApiFail ? e.message : "Couldn't unmatch."); }
  }

  // ================= render =================
  const header = (
    <Link href="/dashboard/messages" className={`${ghost} gap-2 lg:hidden`}><Icon name="arrow" className="size-4 rotate-180" />Back to messages</Link>
  );
  if (view.k === "loading") return <div className="flex flex-1 flex-col gap-4 rounded-2xl bg-white p-4">{header}<div className="flex flex-1 items-center justify-center"><Spinner label="Loading conversation" className="size-10" /></div></div>;
  if (view.k === "gone") {
    return (
      <Card className="flex-1">
        <div className="grid gap-4">{header}
          <h1 role="alert" className="text-[28px] font-bold leading-[1.2] tracking-[-1.2px] text-ink">This conversation isn&apos;t available</h1>
          <p className="text-muted">It may have been removed, or you may no longer have access.</p>
          <div><Link href="/dashboard/messages" className={cta}>Back to messages</Link></div>
        </div>
      </Card>
    );
  }
  if (view.k === "error") {
    return (
      <Card className="flex-1">
        <div className="grid gap-4">{header}
          <h1 role="alert" className="text-[28px] font-bold leading-[1.2] tracking-[-1.2px] text-ink">We couldn&apos;t load this conversation</h1>
          <p className="text-muted">{view.message}</p>
          <div><button type="button" onClick={() => { setView({ k: "loading" }); hydrated.current = false; setNote(""); setAttempt((n) => n + 1); }} className={cta}>Retry</button></div>
        </div>
      </Card>
    );
  }

  const active = state === "ACTIVE";
  const peerName = snap?.peer.displayName ?? "this person";
  const failed = pending.some((p) => p.status === "failed");
  const lastMine = [...msgs].reverse().find((m) => m.mine)?.seq ?? 0;
  const receipt = (seq: number) => (seq <= (snap?.cursors.peer.read ?? 0) ? "Read" : seq <= (snap?.cursors.peer.delivered ?? 0) ? "Delivered" : "Sent");
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= MAX_REPORT ? s : [...s, id]));
  const evidence = msgs.filter((m) => selected.includes(m.id)).map((m) => ({ id: m.id, mine: m.mine, text: m.body, at: m.createdAt }));
  const over = [...draft].length > MAX_CODEPOINTS;
  let lastDay = "";

  return (
    <section aria-label={`Conversation with ${peerName}`} className="flex min-h-0 flex-1 flex-col rounded-2xl bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-hairline p-3 sm:p-4">
        {header}
        <PeerAvatar name={snap?.peer.displayName ?? null} src={snap?.peer.avatarUrl ?? null} size="size-10" />
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold text-ink">{peerName}</h1>
        <div className="flex flex-wrap items-center gap-1">
          {snap?.peer.publicId && <Link href={`/profiles/${snap.peer.publicId}`} className={quiet}>View profile</Link>}
          {msgs.length > 0 && <button type="button" onClick={() => { setSelecting((s) => !s); setSelected([]); }} aria-pressed={selecting} className={quiet}>{selecting ? "Cancel selecting" : "Select messages to report"}</button>}
          <button type="button" onClick={() => setSafety("general")} className={quiet}><Icon name="shield" className="size-4" />Report or block</button>
          {active && (confirmUnmatch
            ? <><button type="button" onClick={() => void unmatch()} className={small}>Confirm unmatch</button><button type="button" onClick={() => setConfirmUnmatch(false)} className={quiet}>Cancel</button></>
            : <button type="button" onClick={() => setConfirmUnmatch(true)} className={quiet}>Unmatch</button>)}
        </div>
      </div>

      {!active && (
        <p role="status" className="border-b border-hairline bg-surface-card px-4 py-3 text-sm">
          {state === "READ_ONLY" ? "This conversation has ended. You can still read your messages." : "You can't send messages in this conversation right now. You can still read your messages."}
        </p>
      )}
      {(stale || !online) && <p role="status" className="border-b border-hairline px-4 py-2 text-sm text-muted">{online ? "Some messages may be out of date. Retrying…" : "Reconnecting… Your draft is kept."}</p>}
      <p role="status" aria-live="polite" className="sr-only">{announce.text ? `${announce.text}${announce.n % 2 ? "" : "​"}` : ""}</p>
      {note && <p role="status" className="px-4 py-2 text-sm text-muted">{note}</p>}

      <div className="relative min-h-0 flex-1">
        <div ref={listRef} onScroll={onScroll} role="region" aria-label="Messages" tabIndex={0} className="absolute inset-0 overflow-y-auto px-3 py-4 sm:px-5">
          {hasOlder && <div className="mb-4 text-center"><button type="button" disabled={loadingOlder} onClick={() => void loadOlder()} className={small}>{loadingOlder ? "Loading…" : "Load earlier messages"}</button></div>}
          {msgs.length === 0 && pending.length === 0 && <p className="py-10 text-center text-muted">{active ? `No messages yet. Say hello to ${peerName}.` : "No messages in this conversation."}</p>}
          <ol className="grid gap-1.5">
            {msgs.map((m) => {
              const d = dayOf(m.createdAt), sep = d !== lastDay; lastDay = d;
              return (
                <li key={m.id} className="grid gap-1.5">
                  {sep && <p className="my-2 text-center text-xs font-semibold text-muted">{d}</p>}
                  <div className={`flex items-end gap-2 ${m.mine ? "flex-row-reverse" : ""}`}>
                    {selecting && (
                      <label className="flex min-h-11 min-w-11 items-center justify-center">
                        <input type="checkbox" checked={selected.includes(m.id)} onChange={() => toggle(m.id)} disabled={!selected.includes(m.id) && selected.length >= MAX_REPORT} className="size-5 accent-ink" />
                        <span className="sr-only">Select message from {m.mine ? "you" : peerName} at {timeOf(m.createdAt)}</span>
                      </label>
                    )}
                    <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 ${m.mine ? "bg-secondary" : "bg-surface-card"}`}>
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      <p className="mt-1 text-right text-xs text-muted">{timeOf(m.createdAt)}{m.mine && m.seq === lastMine && <span className="ml-2 font-semibold">{receipt(m.seq)}</span>}</p>
                    </div>
                  </div>
                </li>
              );
            })}
            {pending.map((p) => (
              <li key={p.clientId} className="flex flex-row-reverse items-end gap-2">
                <div className="max-w-[80%] rounded-2xl bg-secondary px-3.5 py-2 opacity-80">
                  <p className="whitespace-pre-wrap break-words">{p.body}</p>
                  {p.status === "failed" ? (
                    <div className="mt-1 flex flex-wrap items-center justify-end gap-2" role="alert">
                      <span className="text-xs font-semibold text-error">{p.error}</span>
                      {active && <button type="button" onClick={() => retry(p.clientId)} className={small}>Retry</button>}
                      <button type="button" onClick={() => discard(p.clientId)} className={small}>Discard</button>
                    </div>
                  ) : <p className="mt-1 text-right text-xs text-muted">{p.status === "sending" ? "Sending…" : online ? "Waiting…" : "Waiting for connection…"}</p>}
                </div>
              </li>
            ))}
          </ol>
          {peerTyping && active && <p className="mt-3 text-sm text-muted">{peerName} is typing…</p>}
        </div>
        {newCount > 0 && !atBottom && (
          <button type="button" onClick={toBottom} className={`${cta} absolute bottom-3 left-1/2 -translate-x-1/2 gap-2`}><Icon name="arrow" className="size-4 rotate-90" />New messages ({newCount})</button>
        )}
      </div>

      {selecting ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline p-3 sm:p-4">
          <p className="text-sm" role="status">{selected.length} of {MAX_REPORT} selected. Only the messages you pick are shared.</p>
          <button type="button" disabled={selected.length === 0} onClick={() => setSafety("evidence")} className={cta}>Review report</button>
        </div>
      ) : active ? (
        <form className="border-t border-hairline p-3 sm:p-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <label htmlFor="composer" className="sr-only">Message to {peerName}</label>
          <div className="flex items-end gap-2">
            <textarea
              id="composer" rows={1} value={draft} placeholder="Write a message" aria-describedby="composer-help" aria-invalid={over || !!draftErr}
              onChange={(e) => { setDraft(e.target.value); setDraftErr(""); if (e.target.value.trim()) setTyping(true); else setTyping(false); }}
              onBlur={() => setTyping(false)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }}
              disabled={failed}
              className="max-h-40 min-h-11 flex-1 resize-none rounded-2xl border border-ash bg-white px-[15px] py-[11px] text-base text-ink placeholder:text-ash focus:border-ink focus:ring-1 focus:ring-ink disabled:bg-surface-card"
            />
            <button type="submit" disabled={!online || failed || !draft.trim() || over} className={`${cta} gap-2`}><Icon name="arrow" className="size-4" />Send</button>
          </div>
          <p id="composer-help" className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-muted">
            <span>{failed ? "Retry or discard the failed message first." : !online ? "Reconnecting. You can keep typing." : "Enter to send, Shift+Enter for a new line."}</span>
            {[...draft].length > MAX_CODEPOINTS - 200 && <span className={over ? "font-bold text-error" : ""}>{[...draft].length.toLocaleString("en-US")} / {MAX_CODEPOINTS.toLocaleString("en-US")}</span>}
          </p>
          {draftErr && <p role="alert" className="mt-1 text-sm font-bold text-error">{draftErr}</p>}
        </form>
      ) : null}

      {safety && (
        <SafetyDialog
          name={peerName} matchId={matchId} canBlock={active}
          {...(active && snap?.peer.publicId ? { publicId: snap.peer.publicId } : {})}
          {...(safety === "evidence" ? { messages: evidence } : {})}
          onClose={() => setSafety(null)}
          onDone={(blocked) => { setSafety(null); setSelecting(false); setSelected([]); setNote(blocked ? "Done. This conversation has ended." : "Report sent. Thank you."); if (blocked) void reloadMeta(); }}
        />
      )}
    </section>
  );
}
