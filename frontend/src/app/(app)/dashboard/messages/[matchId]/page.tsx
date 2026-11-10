import type { Metadata } from "next";
import { Suspense } from "react";
import { Thread } from "@/components/chat/thread";
import { PageSpinner } from "@/components/spinner";

export const metadata: Metadata = { title: "Messages — Flatter", robots: { index: false } };

export default function ConversationPage({ params }: { params: Promise<{ matchId: string }> }) {
  return (
    <Suspense fallback={<PageSpinner label="Loading conversation" />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  return <Thread key={matchId} matchId={matchId} />;
}
