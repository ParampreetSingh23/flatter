import Link from "next/link";

// Two offset "f" forms; their hooks meet like a roofline over a shared doorway.
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 26V12a5 5 0 0 1 5-5" />
      <path d="M7 15h8" />
      <path d="M21 26V15a4 4 0 0 1 4-4" />
      <path d="M17 18h8" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link href="/route" aria-label="Flatter home" className="inline-flex items-center gap-2 text-white">
      <LogoMark className="size-8" />
      <span className="text-2xl font-black tracking-[-0.02em]">flatter</span>
    </Link>
  );
}
