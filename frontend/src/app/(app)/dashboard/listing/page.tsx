import type { Metadata } from "next";
import { PageSpinner } from "@/components/spinner";
import { Suspense } from "react";
import { ListingEditor } from "@/components/listing/editor";

export const metadata: Metadata = { title: "Your flat listing — Flatter" };

export default function ListingPage() {
  return (
    <div className="mx-auto max-w-4xl lg:max-w-none">
      <Suspense fallback={<PageSpinner label="Loading your listing" />}>
        <ListingEditor />
      </Suspense>
    </div>
  );
}
