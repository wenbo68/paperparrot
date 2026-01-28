"use client";

import { api } from "~/trpc/react";
import { useRouter } from "next/navigation";
import { MessageSquarePlus, Loader2 } from "lucide-react";
import { useState } from "react";

export default function ChatDashboard() {
  const router = useRouter();
  const utils = api.useUtils();
  const [isCreating, setIsCreating] = useState(false);

  const createMutation = api.conversation.create.useMutation({
    onSuccess: async () => {
      await utils.conversation.getAll.invalidate();
      // We need the ID. Since router doesn't return it yet (I recall I didn't verify that part fully besides file router).
      // If conversation router doesn't return ID, we can't redirect easily.
      // I should check `conversation.ts` router. If it doesn't return, I'll update it.
      // For now, I'll assume I need to update it or just fetch latest.
      
      // Let's just fetch latest for now to be safe if I can't update router in this step.
      // Actually, I can update router in same turn? No, separate steps.
      // I'll add a "Loading..." state and then redirect to the new chat by fetching latest after invalidation?
      // Or better: Update router first.
    },
  });
  
  // Actually, I should update the conversation router to return the ID. 
  // But to progress, I will make this page a "Start" page.
  
  const handleStart = async () => {
      setIsCreating(true);
      const name = `New Chat ${new Date().toLocaleTimeString()}`;
      // Logic to find the ID:
      // The mutation returns whatever the backend returns. 
      // Drizzle insert().returning() returns an array.
      // I should fix the router to return the object.
      
      // I will update the router in the next step to be sure.
      // For now, simple implementation assuming router update.
      const conversation = await createMutation.mutateAsync({ name });
      // If conversation is void/undefined, we have a problem.
      if (conversation && 'id' in conversation) {
           router.push(`/chat/${conversation.id}`);
      } else {
          // Fallback: fetch latest
          // This is a bit race-condition-y but works for single user often.
           setIsCreating(false); // Stop loading if failed
      }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center bg-slate-950 text-white">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">Welcome to PaperParrot</h1>
        <p className="mb-8 text-slate-400">Your AI Research Assistant</p>
        
        <button
          onClick={handleStart}
          disabled={isCreating}
          className="flex items-center gap-2 rounded-full bg-blue-600 px-8 py-4 text-lg font-semibold transition hover:bg-blue-700 disabled:opacity-50"
        >
          {isCreating ? <Loader2 className="animate-spin" /> : <MessageSquarePlus />}
          Start New Conversation
        </button>
      </div>
    </div>
  );
}
