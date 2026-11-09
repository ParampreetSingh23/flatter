"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { quiet } from "../dashboard/blocks";
import { SafetyDialog } from "./safety";

// `afterBlock`: where to go once a block succeeds. Report-only stays on the page.
export function ViewerSafety({ publicId, name, afterBlock = "/dashboard" }: { publicId: string; name: string; afterBlock?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)} className={quiet}><Icon name="shield" className="size-4" />Report or block</button>
      {sent && <p role="status" className="mt-2 text-sm">Report sent. Thank you.</p>}
      {open && <SafetyDialog name={name} publicId={publicId} onClose={() => setOpen(false)} onDone={(blocked) => { setOpen(false); if (blocked) router.push(afterBlock); else setSent(true); }} />}
    </div>
  );
}
