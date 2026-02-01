"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { pythonApi } from "~/lib/python-api";
import { api } from "~/trpc/react";
import { Send, Trash2, Paperclip, Loader2 } from "lucide-react";
import { marked } from "marked";
import { v4 as uuidv4 } from "uuid";
import TextareaAutosize from "react-textarea-autosize";

import FilesModal from "./FilesModal"; // Changed import
import { customToast } from "./toast";
import toast from "react-hot-toast";

interface ChatInterfaceProps {
  conversationId?: string;
}

export function ChatInterface({ conversationId }: ChatInterfaceProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const utils = api.useUtils();
  const queryClient = useQueryClient();

  const [userChatInput, setUserChatInput] = useState("");
  // New state for upload loading
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  // New state for file management modal
  const [isFilesModalOpen, setIsFilesModalOpen] = useState(false);

  // 1. Capture initial query strictly once
  const initialQueryRef = useRef(searchParams.get("initialQuery"));
  const hasAutoSent = useRef(false);

  // -- Queries --

  const {
    data: chatHistoryData,
    isLoading: isChatHistoryLoading,
    isError: isChatHistoryError,
  } = useQuery({
    queryKey: ["chatHistory", conversationId],
    queryFn: () =>
      conversationId
        ? pythonApi.getChatHistory(conversationId)
        : Promise.resolve({ history: [] }),
    enabled: !!conversationId,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    initialData:
      initialQueryRef.current && conversationId
        ? { history: [{ role: "user", content: initialQueryRef.current }] }
        : undefined,
  });

  const {
    data: filesData,
    isLoading: isFilesLoading,
    isError: isFilesError,
  } = api.file.getByConversation.useQuery(
    { conversationId: conversationId! },
    { enabled: !!conversationId },
  );

  const messages = chatHistoryData?.history || [];
  const isAgentThinking = messages[messages.length - 1]?.role === "user";

  // -- Mutations --

  const createConversationMutation = api.conversation.create.useMutation({
    onSuccess: async () => {
      void utils.conversation.getAll.invalidate();
    },
  });

  const sendAndReceiveChatMutation = useMutation({
    mutationFn: async (msg: string) => {
      if (!conversationId)
        throw new Error("Conversation ID missing during chat mutation");

      if (messages.length <= 1) {
        try {
          await createConversationMutation.mutateAsync({
            id: conversationId,
            name: new Date().toISOString().replace("T", " ").slice(0, 19),
          });
        } catch (e) {
          // Ignore "Already exists" errors
        }
      }

      return await pythonApi.chat(conversationId, msg);
    },
    onMutate: async (newMsg) => {
      await queryClient.cancelQueries({
        queryKey: ["chatHistory", conversationId],
      });

      const previousData = queryClient.getQueryData([
        "chatHistory",
        conversationId,
      ]);

      queryClient.setQueryData(["chatHistory", conversationId], (old: any) => {
        const oldHistory = old?.history || [];
        const isDuplicate =
          oldHistory.length > 0 &&
          oldHistory[oldHistory.length - 1].content === newMsg;

        if (isDuplicate) return old;

        return {
          ...old,
          history: [...oldHistory, { role: "user", content: newMsg }],
        };
      });

      return { previousData };
    },
    onError: (err, newMsg, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(
          ["chatHistory", conversationId],
          context.previousData,
        );
      }
      alert("Failed to send message.");
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["chatHistory", conversationId], (old: any) => {
        const oldHistory = old?.history || [];
        return {
          ...old,
          history: [...oldHistory, { role: "assistant", content: data.answer }],
        };
      });
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
    onSettled: () => {
      void utils.file.getByConversation.invalidate({
        conversationId: conversationId!,
      });
    },
  });

  // -- Handlers --

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userChatInput.trim() || isAgentThinking) return;

    if (conversationId) {
      sendAndReceiveChatMutation.mutate(userChatInput);
      setUserChatInput("");
      return;
    }

    const newId = uuidv4();
    const encodedQuery = encodeURIComponent(userChatInput);
    setUserChatInput("");
    router.push(`/chat/${newId}?initialQuery=${encodedQuery}`);
  };

  const handleFileDelete = (fileId: string) => {
    // We don't await this because optimistic updates handle the UI
    deleteFileMutation.mutate({ id: fileId });
  };

  const processUploadedFiles = async (
    uploadedFiles: { key: string; url: string; name: string }[],
    toastId: string,
  ) => {
    if (!uploadedFiles || uploadedFiles.length === 0) return;

    setIsProcessingFiles(true);
    customToast.loading("Processing files...", toastId);

    let targetConversationId = conversationId;
    try {
      if (!targetConversationId) {
        targetConversationId = uuidv4();
        await createConversationMutation.mutateAsync({
          id: targetConversationId,
          name: new Date().toISOString().slice(0, 19).replace("T", " "),
        });
        // window.history.replaceState(null, "", `/chat/${targetConversationId}`);
        router.replace(`/chat/${targetConversationId}`);
      }

      await Promise.all(
        uploadedFiles.map(async (file) => {
          await processUploadedFileMutation.mutateAsync({
            name: file.name,
            url: file.url,
            key: file.key,
            conversationId: targetConversationId!,
          });
        }),
      );

      customToast.success("Processing done!", toastId);
    } catch (e) {
      customToast.error("Error processing files. Please try again.", toastId);
    } finally {
      void utils.file.getByConversation.invalidate({
        conversationId: targetConversationId,
      });
      setIsProcessingFiles(false);
    }
  };

  // --- useEffects ---

  useEffect(() => {
    const initialQuery = initialQueryRef.current;
    if (initialQuery && conversationId && !hasAutoSent.current) {
      hasAutoSent.current = true;
      sendAndReceiveChatMutation.mutate(initialQuery);
      router.replace(`/chat/${conversationId}`);
    }
  }, [conversationId, sendAndReceiveChatMutation]);

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
              <p className="text-lg text-gray-400">Failed to load history</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-lg text-gray-400">Where should we begin?</p>
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
            <TextareaAutosize
              minRows={1}
              maxRows={4}
              value={userChatInput}
              onChange={(e) => setUserChatInput(e.target.value)}
              placeholder="Ask PaperParrot anything..."
              className="scrollbar-hide w-full rounded-lg bg-gray-800 px-4 py-2 text-gray-400 placeholder-slate-500 outline-none"
            />
            <button
              type="button"
              onClick={() => setIsFilesModalOpen(true)}
              className="flex items-center justify-center rounded-lg bg-slate-800 px-3 text-gray-400 transition-colors hover:bg-slate-700 hover:text-white"
              title="Manage Files"
            >
              <Paperclip size={20} />
            </button>
            <button
              type="submit"
              disabled={!userChatInput.trim() || isAgentThinking}
              className="rounded-lg bg-blue-600 px-4 py-2 text-gray-300 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send size={20} />
            </button>
          </form>
        </div>
      </div>

      <FilesModal
        isOpen={isFilesModalOpen}
        onClose={() => setIsFilesModalOpen(false)}
        files={filesData || []}
        isLoading={isFilesLoading}
        isError={isFilesError}
        onDelete={handleFileDelete}
        onUploadSuccess={processUploadedFiles}
        isProcessing={isProcessingFiles}
        availability={4 - (filesData?.length ?? 0)}
      />
    </div>
  );
}
