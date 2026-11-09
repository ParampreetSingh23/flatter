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
  const base = bar ? "min-h-11 rounded-2xl px-3 py-2" : "min-h-11 rounded-2xl px-4 py-3";
  return (
    <ul className={bar ? "flex items-center gap-1" : "grid gap-1"}>
      {items.map((i) => {
        const active = i.href === "/dashboard" ? path === "/dashboard" : !!i.href && path.startsWith(i.href);
        return (
          <li key={i.label}>
            {i.href && !i.soon ? (
              <Link href={i.href} onClick={onNavigate} aria-current={active ? "page" : undefined}
                className={`${base} flex items-center gap-2 text-sm font-semibold ${active ? "bg-surface-card text-primary" : "text-ink hover:bg-surface-card"}`}>
                <Icon name={i.icon} className={bar ? "hidden size-[1.125rem] xl:block" : "size-[1.125rem]"} />{i.label}
              </Link>
            ) : (
              <span aria-disabled="true" className={`${base} flex items-center gap-2 text-sm text-muted ${bar ? "" : "justify-between"}`}>
                <span className="flex items-center gap-2"><Icon name={i.icon} className={bar ? "hidden size-[1.125rem] xl:block" : "size-[1.125rem]"} />{i.label}</span>
                <span className={`text-xs ${bar ? "sr-only" : ""}`}><span className="sr-only">, </span>Coming soon</span>
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
        className="flex min-h-11 items-center gap-2 rounded-2xl px-3 py-2 text-sm font-bold text-ink hover:bg-surface-card">
        <Icon name={open ? "close" : "menu"} />
        {open ? "Close" : "Menu"}<span className="sr-only"> navigation</span>
      </button>
      {open && (
        <nav id="mobile-nav" aria-label="Main" className="absolute inset-x-0 top-full z-30 border-b border-hairline bg-white p-4">
          <NavLinks items={items} onNavigate={() => setOpen(false)} />
        </nav>
      )}
    </div>
  );
}
