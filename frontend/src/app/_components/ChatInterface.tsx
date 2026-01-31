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
import MixedUploader from "./MixedUploader";

interface ChatInterfaceProps {
  conversationId?: string;
}

export function ChatInterface({ conversationId }: ChatInterfaceProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const utils = api.useUtils();
  const queryClient = useQueryClient();

  const [userInput, setUserInput] = useState("");

  // 1. Capture initial query strictly once
  const initialQueryRef = useRef(searchParams.get("initialQuery"));
  const hasAutoSent = useRef(false);

  // -- Data Fetching --

  const {
    data: historyData,
    isLoading: isHistoryLoading,
    isError: isHistoryError,
  } = useQuery({
    queryKey: ["chatHistory", conversationId],
    queryFn: () =>
      conversationId
        ? pythonApi.getChatHistory(conversationId)
        : Promise.resolve({ history: [] }),
    enabled: !!conversationId,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    // FIX 1: Seed the query with initial data so it's never empty.
    // This prevents the "flicker" where the empty fetch overwrites the optimistic update.
    initialData:
      initialQueryRef.current && conversationId
        ? { history: [{ role: "user", content: initialQueryRef.current }] }
        : undefined,
  });

  const messages = historyData?.history || [];

  // FIX 2: Derive "Thinking" state from data, not mutation state.
  // If the last message is from the User, the AI is thinking.
  // This is impossible to get "stuck" because as soon as AI replies, it flips to false.
  const lastMessage = messages[messages.length - 1];
  const isAgentThinking = lastMessage?.role === "user";

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

      // FIX 3: Always try to create conversation if it's the first message
      // (We check <= 1 because we might have just added the user message optimistically)
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
        // Prevent duplicate optimistic updates if initialData already added it
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

  // -- Handlers --

  useEffect(() => {
    const initialQuery = initialQueryRef.current; // Use the ref we captured
    if (initialQuery && conversationId && !hasAutoSent.current) {
      hasAutoSent.current = true;

      // 1. Trigger the mutation
      sendAndReceiveChatMutation.mutate(initialQuery);

      // 2. Clean the URL silently
      const newUrl = `/chat/${conversationId}`;
      window.history.replaceState(null, "", newUrl);
    }
  }, [conversationId, sendAndReceiveChatMutation]); // Removed searchParams to prevent re-runs

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim() || isAgentThinking) return;

    if (conversationId) {
      sendAndReceiveChatMutation.mutate(userInput);
      setUserInput("");
      return;
    }

    const newId = uuidv4();
    const encodedQuery = encodeURIComponent(userInput);
    setUserInput("");
    router.push(`/chat/${newId}?initialQuery=${encodedQuery}`);
  };

  // ... (File handling code remains the same) ...
  const { data: files } = api.file.getByConversation.useQuery(
    { conversationId: conversationId! },
    { enabled: !!conversationId },
  );

  const createFileMutation = api.file.create.useMutation();
  const indexFileMutation = useMutation({
    mutationFn: async ({
      fileId,
      url,
      convId,
    }: {
      fileId: string;
      url: string;
      convId: string;
    }) => {
      return pythonApi.indexFile(fileId, url, convId);
    },
  });

  const handleUploadComplete = async (
    uploadedFiles: { key: string; url: string; name: string }[],
  ) => {
    if (uploadedFiles && uploadedFiles.length > 0) {
      try {
        const file = uploadedFiles[0]!;
        let targetConversationId = conversationId;

        if (!targetConversationId) {
          targetConversationId = uuidv4();
          await createConversationMutation.mutateAsync({
            id: targetConversationId,
            name: new Date().toISOString().slice(0, 19),
          });
          router.push(`/chat/${targetConversationId}`);
        }

        const createdFile = await createFileMutation.mutateAsync({
          name: file.name,
          url: file.url,
          key: file.key,
          conversationId: targetConversationId!,
        });

        if (createdFile) {
          await indexFileMutation.mutateAsync({
            fileId: createdFile.id,
            url: file.url,
            convId: targetConversationId!,
          });
        }

        if (targetConversationId) {
          utils.file.getByConversation.invalidate({
            conversationId: targetConversationId,
          });
        }
      } catch (e) {
        console.error("File processing error", e);
        alert("Error processing uploaded file.");
      }
    }
    alert("Upload Completed");
  };

  const deleteFileMutation = api.file.delete.useMutation({
    onSuccess: () => {
      if (conversationId)
        utils.file.getByConversation.invalidate({ conversationId });
    },
  });

  const deleteBackendFileMutation = useMutation({
    mutationFn: async (fileId: string) => {
      if (conversationId) return pythonApi.deleteFile(fileId, conversationId);
    },
  });

  const handleFileDelete = async (fileId: string) => {
    if (!confirm("Delete this file?")) return;
    await deleteFileMutation.mutateAsync({ id: fileId });
    try {
      await deleteBackendFileMutation.mutateAsync(fileId);
    } catch (e) {
      console.error("Failed to delete from backend", e);
    }
  };

  // -- Render --

  return (
    <div className="flex h-full">
      <div className="relative flex w-full flex-col bg-gray-900">
        <div className="scrollbar-thin h-full overflow-y-auto p-4">
          {isHistoryLoading ? (
            <div className="flex h-full items-center justify-center">
              <p className="animate-pulse text-gray-400">Loading...</p>
            </div>
          ) : isHistoryError ? (
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

              {/* FIX 2: Use derived state "isThinking" instead of mutation.isPending */}
              {isAgentThinking && (
                <p className="animate-pulse text-gray-400">Thinking...</p>
              )}
            </div>
          )}
        </div>

        <div className="bg-gray-900 p-4">
          <form
            onSubmit={handleSubmit}
            className="mx-auto flex max-w-3xl gap-2"
          >
            <TextareaAutosize
              minRows={1}
              maxRows={4}
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder="Ask PaperParrot anything..."
              className="scrollbar-hide w-full rounded-lg bg-gray-800 px-4 py-2 text-gray-400 placeholder-slate-500 outline-none"
            />
            <button
              type="submit"
              disabled={!userInput.trim() || isAgentThinking}
              className="rounded-lg bg-blue-600 px-4 py-2 text-gray-300 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send size={20} />
            </button>
          </form>
        </div>
      </div>

      <div className="w-80 overflow-y-auto border-l border-slate-800 bg-slate-900/50 p-4">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
          <Paperclip size={20} />
          Files
        </h2>
        {/* File List logic (unchanged) */}
        <div className="mb-6">
          <MixedUploader
            onUploadSuccess={handleUploadComplete}
            availability={4 - (files?.length ?? 0)}
          />
        </div>
        <div className="flex flex-col gap-2">
          {files?.map((file) => {
            // ... existing file rendering logic ...
            const fileName = file.name;
            const lastDotIndex = fileName.lastIndexOf(".");
            const name =
              lastDotIndex !== -1
                ? fileName.substring(0, lastDotIndex)
                : fileName;
            const extension =
              lastDotIndex !== -1 ? fileName.substring(lastDotIndex) : null;
            return (
              <div
                key={file.id}
                className="group relative flex items-center gap-2 rounded-md bg-slate-800 p-2 text-sm text-slate-300"
              >
                <a
                  href={file.url}
                  target="_blank"
                  className="flex max-w-full hover:underline"
                >
                  <span className="truncate">{name}</span>
                  {extension && <span className="flex-none">{extension}</span>}
                </a>
                <button
                  onClick={() => handleFileDelete(file.id)}
                  className="absolute right-2 hidden text-red-400 group-hover:block hover:text-red-300"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
