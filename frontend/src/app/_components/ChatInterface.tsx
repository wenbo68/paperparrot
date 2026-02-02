"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { pythonApi } from "~/lib/python-api";
import { api } from "~/trpc/react";
import { Send, Trash2, Paperclip, Loader2 } from "lucide-react";
import { marked } from "marked";
import TextareaAutosize from "react-textarea-autosize";

import FilesModal from "./FilesModal";
import { customToast } from "./toast";

interface ChatInterfaceProps {
  conversationId: string; // This is now REQUIRED
}

export function ChatInterface({ conversationId }: ChatInterfaceProps) {
  // Guard clause: This component shouldn't render without an ID
  if (!conversationId) return null;

  const router = useRouter();
  const utils = api.useUtils();
  // const queryClient = useQueryClient();

  const [userChatInput, setUserChatInput] = useState("");
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [isFilesModalOpen, setIsFilesModalOpen] = useState(false);

  // -- Queries --
  const {
    data: chatHistoryData,
    isLoading: isChatHistoryLoading,
    isError: isChatHistoryError,
  } = api.conversation.getHistory.useQuery(
    { conversationId },
    {
      enabled: !!conversationId,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Don't retry if the server said "NOT_FOUND" or "UNAUTHORIZED"
        if (
          error.data?.code === "NOT_FOUND" ||
          error.data?.code === "UNAUTHORIZED"
        ) {
          return false;
        }
        // Otherwise, retry up to 3 times (for network timeouts, etc.)
        return failureCount < 3;
      },
    },
  );

  const {
    data: filesData,
    isLoading: isFilesLoading,
    isError: isFilesError,
  } = api.file.getByConversation.useQuery(
    { conversationId },
    { enabled: !!conversationId },
  );

  const messages = chatHistoryData?.history || [];
  const isAgentThinking = messages[messages.length - 1]?.role === "user";

  // -- Mutations --

  const sendMessageMutation = api.conversation.sendMessage.useMutation({
    onMutate: async ({ message }) => {
      // 1. Cancel ongoing invalidation (from previous call's onSettled)
      // so that the new optimistic update (from current call's onMutate and onSuccess) will not be overwritten
      await utils.conversation.getHistory.cancel({ conversationId });

      // 2. Snapshot the previous value for rollback
      const previousHistory = utils.conversation.getHistory.getData({
        conversationId,
      });

      // 3. Optimistically update with user's message
      utils.conversation.getHistory.setData({ conversationId }, (old) => {
        const oldHistory = old?.history || [];
        return {
          ...old,
          history: [...oldHistory, { role: "user", content: message }],
        };
      });

      return { previousHistory };
    },
    onError: (err, newMsg, context) => {
      // Rollback to snapshot on error
      utils.conversation.getHistory.setData(
        { conversationId },
        context?.previousHistory,
      );
      customToast.error("Failed to send message: " + err.message);
    },
    onSuccess: (data) => {
      // 4. Manually update with the real assistant response (Immediate feedback)
      utils.conversation.getHistory.setData({ conversationId }, (old) => {
        const oldHistory = old?.history || [];
        return {
          ...old,
          history: [...oldHistory, { role: "assistant", content: data.answer }],
        };
      });
    },
    onSettled: async () => {
      // 5. Trigger a background refetch to ensure true consistency with the DB
      // This happens silently without showing a loading spinner

      // await is used here in case you ever use mutateAsync
      // if you use mutateAsync, all lines after mutateAsync will need to wait for this invalidate
      await utils.conversation.getHistory.invalidate({ conversationId });
    },
  });

  const processUploadedFileMutation = api.file.create.useMutation();
  const deleteFileMutation = api.file.delete.useMutation({
    // 1. On Mutate: Update UI immediately
    onMutate: async ({ id }) => {
      // Cancel refetches so they don't overwrite our optimistic update
      await utils.file.getByConversation.cancel({
        conversationId: conversationId!,
      });

      // Snapshot the previous value
      const previousFiles = utils.file.getByConversation.getData({
        conversationId: conversationId!,
      });

      // Optimistically remove the file from the list
      utils.file.getByConversation.setData(
        { conversationId: conversationId! },
        (old) => old?.filter((f) => f.id !== id) ?? [],
      );

      return { previousFiles };
    },
    // 2. On Error: Rollback
    onError: (err, newTodo, context) => {
      utils.file.getByConversation.setData(
        { conversationId: conversationId! },
        context?.previousFiles,
      );
      customToast.error("Failed to delete file.");
    },
    // 4. Always refetch to ensure true sync
    onSettled: () =>
      utils.file.getByConversation.invalidate({ conversationId }),
  });

  // -- Handlers --

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userChatInput.trim() || isAgentThinking) return;

    // Much simpler! No check for missing ID, no creation logic.
    sendMessageMutation.mutate({
      conversationId,
      message: userChatInput,
    });
    setUserChatInput("");
  };

  const handleFileDelete = (fileId: string) => {
    deleteFileMutation.mutate({ id: fileId });
  };

  const processUploadedFiles = async (
    uploadedFiles: { key: string; url: string; name: string }[],
    toastId: string,
  ) => {
    if (!uploadedFiles?.length) return;

    setIsProcessingFiles(true);
    customToast.loading("Processing files...", toastId);

    try {
      // Simply iterate. We KNOW conversationId exists and is valid.
      await Promise.all(
        uploadedFiles.map((file) =>
          processUploadedFileMutation.mutateAsync({
            name: file.name,
            url: file.url,
            key: file.key,
            conversationId: conversationId,
          }),
        ),
      );
      customToast.success("Processing done!", toastId);
    } catch (e) {
      customToast.error("Error processing files.", toastId);
    } finally {
      void utils.file.getByConversation.invalidate({ conversationId });
      setIsProcessingFiles(false);
    }
  };

  // -- Render --

  return (
    <div className="flex h-full">
      <div className="relative flex w-full flex-col bg-gray-900">
        <div className="scrollbar-thin h-full overflow-y-auto p-4">
          {isChatHistoryLoading ? (
            <div className="flex h-full items-center justify-center">
              <p className="animate-pulse text-gray-400">Loading...</p>
            </div>
          ) : isChatHistoryError ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-gray-400">Failed to load chat history</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-gray-400">Where should we begin?</p>
            </div>
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-6">
              {messages.map((msg, i) =>
                msg.role === "user" ? (
                  <div key={i} className={`flex flex-row-reverse`}>
                    <div
                      className={`max-w-[80%] rounded-lg bg-gray-800 px-4 py-2 text-gray-300`}
                    >
                      <div
                        dangerouslySetInnerHTML={{
                          __html: marked(msg.content),
                        }}
                        className="space-y-4 text-gray-400"
                      />
                    </div>
                  </div>
                ) : (
                  <div
                    key={i}
                    dangerouslySetInnerHTML={{ __html: marked(msg.content) }}
                    className="space-y-4 text-gray-400"
                  />
                ),
              )}

              {isAgentThinking && (
                <p className="animate-pulse text-gray-400">Thinking...</p>
              )}
            </div>
          )}
        </div>

        <div className="bg-gray-900 p-4">
          <form
            onSubmit={handleSendChat}
            className="mx-auto flex max-w-3xl gap-2"
          >
            <button
              type="button"
              onClick={() => setIsFilesModalOpen(true)}
              className="flex items-center justify-center rounded-lg bg-gray-800 px-3 text-gray-300 transition-colors hover:bg-gray-700"
              title="Manage Files"
            >
              <Paperclip size={20} />
            </button>
            <TextareaAutosize
              minRows={1}
              maxRows={4}
              value={userChatInput}
              onChange={(e) => setUserChatInput(e.target.value)}
              placeholder="Ask PaperParrot anything..."
              className="scrollbar-hide w-full rounded-lg bg-gray-800 px-4 py-2 text-gray-400 placeholder-gray-500 outline-none"
            />
            <button
              type="submit"
              disabled={!userChatInput.trim() || isAgentThinking}
              className="rounded-lg bg-indigo-600 px-3 text-gray-300 hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send size={20} />
            </button>
          </form>
        </div>
      </div>

      <FilesModal
        isOpen={isFilesModalOpen}
        onClose={() => setIsFilesModalOpen(false)}
        conversationId={conversationId}
        files={filesData || []}
        isFilesLoading={isFilesLoading}
        isFilesError={isFilesError}
        onDelete={handleFileDelete}
        onUploadSuccess={processUploadedFiles}
        isProcessing={isProcessingFiles}
        availability={4 - (filesData?.length ?? 0)}
      />
    </div>
  );
}
