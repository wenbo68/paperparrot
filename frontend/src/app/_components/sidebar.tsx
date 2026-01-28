"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "~/trpc/react";
import { MessageSquare, Plus, Trash2, LogOut } from "lucide-react";

export function Sidebar({ className }: { className?: string }) {
  const router = useRouter();
  const utils = api.useUtils();
  const [isCreating, setIsCreating] = useState(false);

  // Fetch conversations
  const { data: conversations, isLoading } = api.conversation.getAll.useQuery();

  // Create mutation
  const createMutation = api.conversation.create.useMutation({
    onSuccess: async () => {
      await utils.conversation.getAll.invalidate();
      setIsCreating(false);
      // Ideally redirect to the new conversation, but getAll doesn't return the ID of the created one easily 
      // unless we change the router to return it.
      // For now, we'll just invalidate. 
      // TODO: Update router to return ID.
    },
  });

  // Delete mutation
  const deleteMutation = api.conversation.delete.useMutation({
    onSuccess: async () => {
      await utils.conversation.getAll.invalidate();
      router.push("/"); // Redirect to home if deleted current
    },
  });

  const handleCreate = async () => {
    setIsCreating(true);
    // Simple name for now, could be dynamic or prompt user
    const name = `New Chat ${new Date().toLocaleTimeString()}`;
    await createMutation.mutateAsync({ name });
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault(); // Prevent navigation
    if (confirm("Are you sure you want to delete this chat?")) {
      await deleteMutation.mutateAsync({ id });
    }
  };

  return (
    <div className={`flex h-full w-64 flex-col bg-slate-900 text-white ${className}`}>
      <div className="p-4">
        <button
          onClick={handleCreate}
          disabled={isCreating}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          <Plus size={20} />
          {isCreating ? "Creating..." : "New Chat"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2">
        {isLoading ? (
          <div className="p-4 text-center text-slate-500">Loading...</div>
        ) : (
          <div className="flex flex-col gap-1">
            {conversations?.map((conv) => (
              <Link
                key={conv.id}
                href={`/c/${conv.id}`}
                className="group flex items-center justify-between rounded-md p-3 hover:bg-slate-800"
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <MessageSquare size={18} className="text-slate-400" />
                  <span className="truncate text-sm">{conv.name}</span>
                </div>
                <button
                  onClick={(e) => handleDelete(e, conv.id)}
                  className="hidden text-slate-400 hover:text-red-400 group-hover:block"
                >
                  <Trash2 size={16} />
                </button>
              </Link>
            ))}
            {conversations?.length === 0 && (
              <div className="p-4 text-center text-sm text-slate-500">
                No conversations yet.
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-slate-800 p-4">
        <Link
          href="/api/auth/signout"
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-white"
        >
          <LogOut size={16} />
          Sign Out
        </Link>
      </div>
    </div>
  );
}
