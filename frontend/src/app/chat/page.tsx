"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";
import { Loader2 } from "lucide-react";

export default function ChatRootPage() {
  const router = useRouter();
  const createMutation = api.conversation.create.useMutation();
  // Prevent double-firing in React Strict Mode
  const hasCreated = useRef(false);

  useEffect(() => {
    if (hasCreated.current) return;
    hasCreated.current = true;

    createMutation.mutate(
      {},
      {
        onSuccess: (data) => {
          // Only redirect after we CONFIRM the DB record exists
          router.replace(`/chat/${data?.id}`);
        },
        onError: (err) => {
          console.error("Failed to create session", err);
          hasCreated.current = false; // Allow retry
        },
      },
    );
  }, []);

  return (
    <div className="flex h-full w-full items-center justify-center bg-gray-900">
      <div className="flex flex-col items-center gap-4 text-gray-400">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p>Initializing secure session...</p>
      </div>
    </div>
  );
}
