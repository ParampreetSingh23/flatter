"use client";
import { useAuth } from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";
import { ApiFail, api } from "@/lib/api";
import { REPORT_REASONS } from "@/lib/matching-types";
import { btnBack, btnNext, inputCls } from "../onboarding/fields";

type Choice = "report_block" | "report" | "block";

// Native <dialog>: focus is trapped, Escape closes, focus returns to the opener.
export function SafetyDialog({ name, publicId, matchId, onClose, onDone }: {
  name: string; publicId: string; matchId?: string; onClose: () => void; onDone: (blocked: boolean) => void;
}) {
  const { getToken } = useAuth();
  const ref = useRef<HTMLDialogElement>(null);
  const [choice, setChoice] = useState<Choice>("report_block");
  const [reason, setReason] = useState("HARASSMENT");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { ref.current?.showModal(); }, []);

  async function submit() {
    setBusy(true); setErr("");
    try {
      const t = await getToken();
      if (choice === "block") await api(t, "POST", "/api/blocks", { publicId });
      else await api(t, "POST", "/api/reports", { publicId, reason, details: details.trim() || undefined, ...(matchId && { matchId }), alsoBlock: choice === "report_block" });
      onDone(choice !== "report");
    } catch (e) {
      setErr(e instanceof ApiFail ? e.message : "Something went wrong. Nothing was sent.");
      setBusy(false);
    }
  }
  const opt = (v: Choice, title: string, desc: string) => (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-hairline p-3 has-checked:border-ink has-checked:bg-surface-card">
      <input type="radio" name="safety" checked={choice === v} onChange={() => setChoice(v)} className="mt-1 size-4 accent-ink" />
      <span><span className="block font-bold">{title}</span><span className="block text-sm text-muted">{desc}</span></span>
    </label>
  );
  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="safety-h" className="m-auto w-[min(32rem,calc(100%-2rem))] rounded-[32px] bg-white p-8 text-ink shadow-[0_8px_16px_rgba(0,0,0,.15)] backdrop:bg-black/50">
      <h2 id="safety-h" className="text-[22px] font-semibold leading-[1.25] text-ink">Report or block {name}</h2>
      <p className="mt-2 text-sm text-muted">They won&apos;t be told. Blocking hides you from each other, ends any match and can&apos;t be seen by them.</p>
      <fieldset className="mt-4 grid gap-3">
        <legend className="sr-only">What do you want to do?</legend>
        {opt("report_block", "Report and block", "Send a report to our team and hide each other.")}
        {opt("report", "Report only", "Send a report to our team. You stay visible to each other.")}
        {opt("block", "Block only", "Hide each other without sending a report.")}
      </fieldset>
      {choice !== "block" && (
        <div className="mt-4 grid gap-4">
          <div>
            <label htmlFor="rep-reason" className="block font-bold">Reason</label>
            <select id="rep-reason" value={reason} onChange={(e) => setReason(e.target.value)} className={`${inputCls} mt-2`}>
              {REPORT_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="rep-details" className="block font-bold">Details (optional)</label>
            <textarea id="rep-details" value={details} maxLength={1000} rows={3} onChange={(e) => setDetails(e.target.value)} className={`${inputCls} mt-2`} />
            <p className="mt-1 text-sm text-muted">Our team reviews every report. Don&apos;t include passwords or payment details.</p>
          </div>
        </div>
      )}
      {err && <p role="alert" className="mt-4 text-sm font-bold text-error">{err}</p>}
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button type="button" onClick={() => ref.current?.close()} className={btnBack}>Cancel</button>
        <button type="button" disabled={busy} onClick={() => void submit()} className={btnNext}>{busy ? "Sending…" : choice === "block" ? "Block" : choice === "report" ? "Send report" : "Report and block"}</button>
      </div>
    </dialog>
  );
}
