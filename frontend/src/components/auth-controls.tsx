import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { Suspense } from "react";

export const btnPrimary =
  "inline-flex items-center justify-center rounded-xl bg-white px-6 py-3 font-mono text-xs font-bold uppercase tracking-wider text-electric hover:bg-cream";
export const btnSecondary =
  "inline-flex items-center justify-center rounded-xl bg-indigo px-6 py-3 font-mono text-xs font-bold uppercase tracking-wider text-white hover:bg-black";

// Request-dependent: must sit in Suspense; fallback keeps layout size stable.
export function NavAuth() {
  return (
    <Suspense fallback={<div className="h-10 w-44" />}>
      <Show when="signed-out">
        <div className="flex items-center gap-2">
          <SignInButton mode="modal" forceRedirectUrl="/auth/continue">
            <button className="rounded-xl px-4 py-3 font-mono text-xs font-bold uppercase tracking-wider text-white hover:bg-indigo">
              Log in
            </button>
          </SignInButton>
          <SignUpButton mode="modal" forceRedirectUrl="/auth/continue">
            <button className={btnPrimary}>Sign up</button>
          </SignUpButton>
        </div>
      </Show>
      <Show when="signed-in">
        <UserButton />
      </Show>
    </Suspense>
  );
}

export function SignUpCta() {
  return (
    <Suspense fallback={<div className="h-12 w-40" />}>
      <Show when="signed-out">
        <SignUpButton mode="modal" forceRedirectUrl="/auth/continue">
          <button className={btnPrimary}>Get started</button>
        </SignUpButton>
      </Show>
    </Suspense>
  );
}
