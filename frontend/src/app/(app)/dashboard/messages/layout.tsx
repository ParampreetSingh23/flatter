import { Suspense } from "react";
import { MessagesFrame } from "@/components/chat/messages-frame";
import { PageSpinner } from "@/components/spinner";

export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<PageSpinner label="Loading messages" />}>
      <MessagesFrame>{children}</MessagesFrame>
    </Suspense>
  );
}
