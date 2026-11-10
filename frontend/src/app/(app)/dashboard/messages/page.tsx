import type { Metadata } from "next";
import { Icon } from "@/components/icons";

export const metadata: Metadata = { title: "Messages — Flatter" };

// Desktop-only placeholder (on mobile the inbox itself is the page).
export default function MessagesIndex() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center rounded-2xl bg-white p-8 text-center">
      <Icon name="message" className="size-12 text-ink" />
      <h2 className="mt-4 text-[22px] font-semibold text-ink">Select a conversation</h2>
      <p className="mt-2 max-w-sm text-muted">Pick someone from the list to read and send messages.</p>
    </div>
  );
}
