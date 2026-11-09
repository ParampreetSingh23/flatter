"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/icons";

export interface NavItem { label: string; href?: string; soon?: boolean; icon: IconName }

// Only items with an href navigate. "Coming soon" items are plain text: no link, no dead URL.
// bar = horizontal top navbar (desktop); list = stacked panel (mobile menu).
export function NavLinks({ items, onNavigate, bar }: { items: NavItem[]; onNavigate?: () => void; bar?: boolean }) {
  const path = usePathname();
  const base = bar ? "rounded-xl px-3 py-2" : "rounded-xl px-4 py-3";
  return (
    <ul className={bar ? "flex items-center gap-1" : "grid gap-1"}>
      {items.map((i) => {
        const active = i.href === "/dashboard" ? path === "/dashboard" : !!i.href && path.startsWith(i.href);
        return (
          <li key={i.label}>
            {i.href && !i.soon ? (
              <Link href={i.href} onClick={onNavigate} aria-current={active ? "page" : undefined}
                className={`${base} flex items-center gap-2 text-sm font-bold ${bar ? (active ? "bg-white text-electric" : "text-white hover:bg-indigo") : active ? "bg-indigo text-white" : "text-indigo hover:bg-indigo/10"}`}>
                <Icon name={i.icon} className="size-[1.125rem]" />{i.label}
              </Link>
            ) : (
              <span aria-disabled="true" className={`${base} flex items-center gap-2 text-sm ${bar ? "text-white/60" : "justify-between text-muted"}`}>
                <span className="flex items-center gap-2"><Icon name={i.icon} className="size-[1.125rem]" />{i.label}</span>
                <span className={`font-mono text-xs uppercase tracking-wider ${bar ? "sr-only" : ""}`}><span className="sr-only">, </span>Coming soon</span>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// Same items as the desktop bar, in a disclosure panel for narrow screens.
export function MobileNav({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open]);
  return (
    <div className="lg:hidden">
      <button ref={btn} type="button" aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-xl px-3 py-2 font-mono text-xs font-bold uppercase tracking-wider text-white hover:bg-indigo">
        <Icon name={open ? "close" : "menu"} />
        {open ? "Close" : "Menu"}<span className="sr-only"> navigation</span>
      </button>
      {open && (
        <nav id="mobile-nav" aria-label="Main" className="absolute inset-x-0 top-full z-30 bg-cream p-4 shadow-lg">
          <NavLinks items={items} onNavigate={() => setOpen(false)} />
        </nav>
      )}
    </div>
  );
}
