"use client";
import { usePathname } from "next/navigation";
import { InboxList } from "./inbox";

// Desktop: inbox beside the open conversation. Mobile: inbox, or the full conversation with a Back button.
export function MessagesFrame({ children }: { children: React.ReactNode }) {
  const inThread = /^\/dashboard\/messages\/[^/]+/.test(usePathname());
  return (
    <div className="grid h-[calc(100dvh-9rem)] gap-4 lg:h-[calc(100dvh-7.5rem)] lg:grid-cols-[22rem_minmax(0,1fr)]">
      <aside aria-label="Conversations" className={`${inThread ? "hidden lg:flex" : "flex"} min-h-0 flex-col`}><InboxList /></aside>
      <section className={`${inThread ? "flex" : "hidden lg:flex"} min-h-0 flex-col`}>{children}</section>
    </div>
  );
}
