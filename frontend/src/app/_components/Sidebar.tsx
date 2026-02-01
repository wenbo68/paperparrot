"use client";

import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { useState, useRef, useEffect, useCallback } from "react";
import { useMutation } from "@tanstack/react-query"; // Import standard useMutation
import { api } from "~/trpc/react";
import { pythonApi } from "~/lib/python-api";
import {
  MessageSquare,
  Plus,
  Trash2,
  LogOut,
  MoreHorizontal,
  Pencil,
  X,
  MoreVertical,
} from "lucide-react";
import { SidebarOptionsModal } from "./SidebarOptionsModal";
import { SidebarRenameModal } from "./SidebarRenameModal";

// --- Utility Hook for Long Press ---
function useLongPress(callback: () => void, ms = 500) {
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const start = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      callback();
    }, ms);
  }, [callback, ms]);

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return {
    onMouseDown: start,
    onMouseUp: stop,
    onMouseLeave: stop,
    onTouchStart: start,
    onTouchEnd: stop,
  };
}

// --- Types ---
type Conversation = {
  id: string;
  name: string;
};

// --- Main Sidebar Component ---
export function Sidebar({ className }: { className?: string }) {
  const router = useRouter();
  const utils = api.useUtils();
  const { data: conversations, isLoading } = api.conversation.getAll.useQuery();

  // State for Modals
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [showOptionsModal, setShowOptionsModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [newName, setNewName] = useState("");

  // Mutations
  const deleteMutation = api.conversation.delete.useMutation({
    onMutate: async ({ id }) => {
      await utils.conversation.getAll.cancel();
      const previousConversations = utils.conversation.getAll.getData();

      utils.conversation.getAll.setData(
        undefined,
        (old) => old?.filter((c) => c.id !== id) ?? [],
      );

      return { previousConversations };
    },
    onError: (err, newTodo, context) => {
      utils.conversation.getAll.setData(
        undefined,
        context?.previousConversations,
      );
      alert("Failed to delete conversation.");
    },
    onSuccess: (data, variables) => {
      if (selectedConv?.id === variables.id) {
        router.push("/chat");
      }
    },
    onSettled: () => {
      utils.conversation.getAll.invalidate();
    },
  });

  const renameMutation = api.conversation.rename.useMutation({
    onMutate: async ({ id, name }) => {
      await utils.conversation.getAll.cancel();
      const previousConversations = utils.conversation.getAll.getData();

      utils.conversation.getAll.setData(
        undefined,
        (old) => old?.map((c) => (c.id === id ? { ...c, name } : c)) ?? [],
      );

      return { previousConversations };
    },
    onError: (err, newTodo, context) => {
      utils.conversation.getAll.setData(
        undefined,
        context?.previousConversations,
      );
      alert("Failed to rename conversation.");
    },
    onSuccess: async () => {
      closeAllModals();
    },
    onSettled: () => {
      utils.conversation.getAll.invalidate();
    },
  });

  // Actions
  const handleCreate = () => router.push("/chat");

  const openOptions = (conv: Conversation) => {
    setSelectedConv(conv);
    setShowOptionsModal(true);
  };

  const closeAllModals = () => {
    setShowOptionsModal(false);
    setShowRenameModal(false);
    setSelectedConv(null);
    setNewName("");
  };

  const handleDelete = async () => {
    if (!selectedConv) return;
    if (confirm("Are you sure you want to delete this chat?")) {
      await deleteMutation.mutateAsync({ id: selectedConv.id });
    }
  };

  const handleRenameSubmit = async (newNameVal: string) => {
    if (!selectedConv || !newNameVal.trim()) return;
    await renameMutation.mutateAsync({
      id: selectedConv.id,
      name: newNameVal,
    });
  };

  return (
    <>
      <div className={`flex h-full w-72 flex-col bg-gray-900 ${className}`}>
        <div className="p-4">
          <button
            onClick={handleCreate}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 font-medium text-gray-300 transition hover:bg-indigo-700"
          >
            {/* <Plus size={20} /> */}
            New Chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4">
          {isLoading ? (
            <p className="animate-pulse p-3 text-center text-gray-500">
              Loading...
            </p>
          ) : (
            <div className="flex flex-col">
              {conversations?.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  conversation={conv}
                  onOpenOptions={() => openOptions(conv)}
                />
              ))}
              {conversations?.length === 0 && (
                <p className="p-3 text-center text-gray-400">
                  No conversations yet.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-gray-800 p-4">
          <Link
            href="/api/auth/signout"
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-blue-400"
          >
            <LogOut size={16} />
            Sign Out
          </Link>
        </div>
      </div>

      {/* --- Options Modal (Rename/Delete) --- */}
      <SidebarOptionsModal
        isOpen={showOptionsModal && !!selectedConv}
        onClose={closeAllModals}
        onRename={() => {
          setNewName(selectedConv?.name || "");
          setShowOptionsModal(false);
          setShowRenameModal(true);
        }}
        onDelete={handleDelete}
      />

      {/* --- Rename Input Modal --- */}
      <SidebarRenameModal
        isOpen={showRenameModal}
        onClose={closeAllModals}
        initialName={newName}
        onRename={handleRenameSubmit}
        isPending={renameMutation.isPending}
      />
    </>
  );
}

// --- Individual Conversation Item Component ---
function ConversationItem({
  conversation,
  onOpenOptions,
}: {
  conversation: Conversation;
  onOpenOptions: () => void;
}) {
  const params = useParams(); // Get URL params

  // Check if this conversation is active based on URL
  // Assuming route is /chat/[chatId]
  const isActive = params?.chatId === conversation.id; // Adjust 'id' if your param name is different (e.g. chatId)

  // Long press hook
  const longPressProps = useLongPress(() => {
    onOpenOptions();
  }, 600); // 600ms hold time

  return (
    <div className="group relative">
      <Link
        href={`/chat/${conversation.id}`}
        {...longPressProps} // Attach long press events
        // Disable context menu on mobile to prevent default browser menu on long press
        onContextMenu={(e) => e.preventDefault()}
        className={`flex overflow-hidden rounded-lg p-3 text-gray-400 transition-colors group-hover:pr-10 group-hover:text-blue-400 ${
          isActive ? "bg-gray-800" : ""
        }`}
      >
        <span className="truncate text-sm">{conversation.name}</span>
      </Link>

      {/* 3 Dots Button - Absolute positioned to sit on top of the link */}
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onOpenOptions();
        }}
        className={`absolute top-1/2 right-2 hidden -translate-y-1/2 rounded p-1 text-gray-400 group-hover:block hover:bg-gray-700`}
        aria-label="Options"
      >
        <MoreVertical size={16} />
      </button>
    </div>
  );
}
