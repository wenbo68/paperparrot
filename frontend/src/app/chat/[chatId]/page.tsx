"use client";

import { useParams } from "next/navigation";
import { ChatInterface } from "~/app/_components/ChatInterface";

export default function ChatPage() {
  const params = useParams();
  const conversationId = params.chatId as string;

  return <ChatInterface conversationId={conversationId} />;
}
