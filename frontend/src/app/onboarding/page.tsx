import type { Metadata } from "next";
import { PageSpinner } from "@/components/spinner";
import { Suspense } from "react";
import { Wizard } from "@/components/onboarding/wizard";

export const metadata: Metadata = { title: "Set up your profile — Flatter" };

export default function Onboarding() {
  return (
    <Suspense fallback={<PageSpinner label="Loading" />}>
      <Wizard />
    </Suspense>
  );
}
