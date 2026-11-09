import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { Suspense } from "react";

export const btnPrimary =
  "inline-flex min-h-11 items-center justify-center rounded-2xl bg-primary px-3.5 py-1.5 text-sm font-bold leading-none text-white hover:bg-primary-pressed active:bg-primary-pressed disabled:bg-surface-card disabled:text-ash";
export const btnSecondary =
  "inline-flex min-h-11 items-center justify-center rounded-2xl bg-secondary px-3.5 py-1.5 text-sm font-bold leading-none text-ink hover:bg-secondary-pressed active:bg-secondary-pressed disabled:bg-surface-card disabled:text-ash";

// Request-dependent: must sit in Suspense; fallback keeps layout size stable.
export function NavAuth() {
  return (
    <Suspense fallback={<div className="h-10 w-52" />}>
      <Show when="signed-out">
        <div className="flex items-center gap-2">
          <SignInButton mode="modal" forceRedirectUrl="/auth/continue">
            <button className={btnSecondary}>
              Log in
            </button>
          </SignInButton>
          <SignUpButton mode="modal" forceRedirectUrl="/auth/continue">
            <button className={btnPrimary}>Sign up</button>
          </SignUpButton>
        </div>
      </Show>
      <Show when="signed-in">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className={btnPrimary}>Dashboard</Link>
          <UserButton />
        </div>
      </Show>
    </Suspense>
  );
}

export function SignUpCta() {
  return (
    <Suspense fallback={<div className="h-12 w-40" />}>
      <Show when="signed-out">
        <SignUpButton mode="modal" forceRedirectUrl="/auth/continue">
          <button className={btnSecondary}>Get started</button>
        </SignUpButton>
      </Show>
      <Show when="signed-in">
        <Link href="/dashboard" className={btnSecondary}>Go to dashboard</Link>
      </Show>
    </Suspense>
  );
}
