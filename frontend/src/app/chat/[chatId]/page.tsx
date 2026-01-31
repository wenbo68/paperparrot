"use client";

import { useParams } from "next/navigation";
import { ChatInterface } from "~/app/_components/ChatInterface";

export default function ChatPage() {
  const params = useParams();
  const conversationId = params.chatId as string;

  // key={conversationId} forces React to destroy and recreate the component
  // when the chat ID changes, ensuring a clean slate.
  return <ChatInterface conversationId={conversationId} key={conversationId} />;
}
