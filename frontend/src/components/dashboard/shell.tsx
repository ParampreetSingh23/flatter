import { UserButton } from "@clerk/nextjs";
import { PageSpinner } from "@/components/spinner";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Icon } from "@/components/icons";
import { Logo } from "@/components/logo";
import { ApiFail } from "@/lib/api";
import { INTENT_LABEL, type DashboardData } from "@/lib/dashboard-types";
import { serverGet } from "@/lib/server-api";
import { MobileNav, NavLinks, type NavItem } from "./nav";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<PageSpinner label="Loading" />}>
      <Inner>{children}</Inner>
    </Suspense>
  );
}

async function Inner({ children }: { children: React.ReactNode }) {
  // Header context only. A failure here never blocks the page; incomplete onboarding resumes onboarding.
  let info: DashboardData | null = null;
  try {
    info = await serverGet<DashboardData>("/api/dashboard");
  } catch (e) {
    if (e instanceof ApiFail && e.status === 403) redirect("/auth/continue");
  }
  const f = info?.features;
  const items: NavItem[] = [
    { label: "Dashboard", href: "/dashboard", icon: "grid" },
    { label: "My Profile", href: "/dashboard/profile", icon: "user" },
    { label: "Matches", icon: "heart", soon: f?.matches !== "available" },
    { label: "Messages", icon: "message", soon: f?.messages !== "available" },
    { label: "Groups", icon: "users", soon: f?.groups !== "available" },
  ];
  return (
    <>
      <header className="grain sticky top-0 z-40">
        <div className="mx-auto flex h-16 max-w-[75rem] items-center justify-between gap-4 px-4 sm:px-6 lg:h-[4.5rem]">
          <Logo href="/dashboard" />
          <nav aria-label="Main" className="hidden lg:block">
            <NavLinks items={items} bar />
          </nav>
          <div className="flex items-center gap-3 text-white">
            {info && (
              <p className="hidden items-center gap-2 text-sm xl:flex">
                <Icon name="pin" className="size-4" />
                <span><span className="font-bold">{info.housing?.city?.label ?? "Delhi NCR"}</span><span className="opacity-80"> · {INTENT_LABEL[info.intent]}</span></span>
              </p>
            )}
            <UserButton />
            <MobileNav items={items} />
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-[75rem] flex-1 px-4 py-8 sm:px-6 lg:py-10">{children}</main>
    </>
  );
}
