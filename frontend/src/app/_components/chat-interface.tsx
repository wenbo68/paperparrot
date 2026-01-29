"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { pythonApi } from "~/lib/python-api";
import { api } from "~/trpc/react";
import { UploadButton } from "~/utils/uploadthing";
import { Send, FileText, Trash2, Paperclip, Loader2 } from "lucide-react";
import { marked } from "marked";
import { v4 as uuidv4 } from "uuid";
import TextareaAutosize from "react-textarea-autosize";

type Message = {
  role: "user" | "assistant";
  content: string;
};

interface ChatInterfaceProps {
  conversationId?: string;
}

export function ChatInterface({ conversationId }: ChatInterfaceProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const utils = api.useUtils();

  // State
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Ref to track if we've handled the auto-send for this specific page load
  const hasAutoSent = useRef(false);

  // -- 1. Data Fetching --

  // Fetch Chat History (Only if conversationId exists)
  const { data: historyData, isLoading: isHistoryLoading } = useQuery({
    queryKey: ["chatHistory", conversationId],
    queryFn: () =>
      conversationId
        ? pythonApi.getChatHistory(conversationId)
        : Promise.resolve({ history: [] }),
    enabled: !!conversationId,
    refetchOnWindowFocus: false,
  });

  // Sync messages with history when it loads
  // We use a ref to prevent overwriting optimistic updates if the user is typing fast
  const messagesLenRef = useRef(messages.length);
  useEffect(() => {
    messagesLenRef.current = messages.length;
  }, [messages]);

  useEffect(() => {
    if (conversationId && historyData?.history) {
      // If history is empty but we have local messages, it's likely a new chat we just started.
      // Don't overwrite local state with empty history.
      if (historyData.history.length === 0 && messagesLenRef.current > 0) {
        return;
      }
      setMessages(historyData.history);
    } else if (!conversationId) {
      // Reset if we navigated back to "New Chat"
      setMessages([]);
    }
  }, [historyData, conversationId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // -- 2. Mutations --

  const createConversationMutation = api.conversation.create.useMutation({
    onSuccess: async () => {
      await utils.conversation.getAll.invalidate();
    },
  });

  const chatMutation = useMutation({
    mutationFn: async (msg: string) => {
      if (!conversationId)
        throw new Error("Conversation ID missing during chat mutation");

      // 1. If this is the very first message, ensure the DB row exists.
      // We check messages.length === 0 (or strictly 1 if we just added the optimistic one).
      // Ideally, check if history was empty.
      if (messages.length === 0) {
        try {
          await createConversationMutation.mutateAsync({
            id: conversationId,
            name: msg.slice(0, 30) || "New Chat",
          });
        } catch (e) {
          // Ignore unique constraint errors if it was already created by file upload or race condition
          console.log("Conversation might already exist, proceeding...");
        }
      }

      // 2. Optimistically add user message (UI only)
      const userMsg: Message = { role: "user", content: msg };
      setMessages((prev) => [...prev, userMsg]);

      // 3. Call Python Backend
      const res = await pythonApi.chat(conversationId, msg);
      return res;
    },
    onSuccess: (data) => {
      const assistantMsg: Message = { role: "assistant", content: data.answer };
      setMessages((prev) => [...prev, assistantMsg]);
    },
    onError: (error) => {
      console.error("Chat error:", error);
      alert(
        "Failed to send message: " +
          (error instanceof Error ? error.message : String(error)),
      );
    },
  });

  // -- 3. Handlers --

  // Handle "Auto Send" from URL (The transition magic)
  useEffect(() => {
    const initialQuery = searchParams.get("initialQuery");
    if (initialQuery && conversationId && !hasAutoSent.current) {
      hasAutoSent.current = true;
      // Clean URL first so we don't resend on refresh
      router.replace(`/chat/${conversationId}`);
      // Send the message
      chatMutation.mutate(initialQuery);
    }
  }, [searchParams, conversationId, chatMutation, router]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || chatMutation.isPending) return;

    // SCENARIO A: We are already in a chat
    if (conversationId) {
      chatMutation.mutate(input);
      setInput("");
      return;
    }

    // SCENARIO B: We are in "New Chat" -> Generate ID and Redirect
    const newId = uuidv4();
    const encodedQuery = encodeURIComponent(input);
    setInput(""); // Clear input immediately
    // Navigate to the new ID, passing the message in URL
    router.push(`/chat/${newId}?initialQuery=${encodedQuery}`);
  };

  // -- 4. File Management --

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

  const handleUploadComplete = async (res: any[]) => {
    if (res && res.length > 0) {
      try {
        const file = res[0]!;
        let targetId = conversationId;

        // Handle Upload on "New Chat" Screen
        if (!targetId) {
          targetId = uuidv4();
          // We MUST create the conversation row in DB before linking file
          await createConversationMutation.mutateAsync({
            id: targetId,
            name: "New Chat (File)",
          });
          // Redirect user to this new chat context
          router.push(`/chat/${targetId}`);
        }

        // 1. Create File Record in DB
        const createdFile = await createFileMutation.mutateAsync({
          name: file.name,
          url: file.url,
          key: file.key,
          conversationId: targetId,
        });

        // 2. Index in Python Backend
        if (createdFile) {
          await indexFileMutation.mutateAsync({
            fileId: createdFile.id,
            url: file.url,
            convId: targetId,
          });
        }

        // Refresh file list
        if (targetId) {
          utils.file.getByConversation.invalidate({ conversationId: targetId });
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

  // -- 5. Render --

  return (
    <div className="flex h-full">
      {/* Chat */}
      <div className="relative flex w-full flex-col bg-gray-900">
        {/* Messages */}
        <div className="scrollbar-thin h-full overflow-y-auto p-4">
          {isHistoryLoading ? (
            <div className="flex h-full items-center justify-center">
              <p className="animate-pulse text-gray-400">Loading...</p>
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
              {chatMutation.isPending && (
                <div className="flex gap-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600">
                    AI
                  </div>
                  <div className="rounded-lg bg-slate-800 px-4 py-2 text-slate-200">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="sr-only">Thinking...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="bg-gray-900 p-4">
          <form
            onSubmit={handleSubmit}
            className="mx-auto flex max-w-3xl gap-2"
          >
            <TextareaAutosize
              minRows={1}
              maxRows={4}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask PaperParrot anything..."
              className="scrollbar-hide w-full rounded-lg bg-gray-800 px-4 py-2 text-gray-400 placeholder-slate-500 outline-none"
            />
            <button
              type="submit"
              disabled={!input.trim() || chatMutation.isPending}
              className="rounded-lg bg-blue-600 px-4 py-2 text-gray-300 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send size={20} />
            </button>
          </form>
        </div>
      </div>

      {/* Files Panel (Right Sidebar) */}
      <div className="w-80 overflow-y-auto border-l border-slate-800 bg-slate-900/50 p-4">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
          <Paperclip size={20} />
          Files
        </h2>

        <div className="mb-6">
          <UploadButton
            endpoint="fileUploader"
            onClientUploadComplete={handleUploadComplete}
            onUploadError={(error: Error) => {
              alert(`ERROR! ${error.message}`);
            }}
            appearance={{
              button:
                "bg-slate-700 text-white hover:bg-slate-600 w-full text-sm py-2",
              allowedContent: "text-slate-400 text-xs",
            }}
          />
        </div>

        <div className="flex flex-col gap-2">
          {files?.map((file) => (
            <div
              key={file.id}
              className="group relative flex items-center gap-2 rounded-md bg-slate-800 p-2 text-sm text-slate-300"
            >
              <FileText size={16} className="shrink-0" />
              <a
                href={file.url}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate hover:underline"
              >
                {file.name}
              </a>
              <button
                onClick={() => handleFileDelete(file.id)}
                className="absolute right-2 hidden text-red-400 group-hover:block hover:text-red-300"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          {(!files || files.length === 0) && (
            <p className="text-center text-xs text-slate-500">
              No files uploaded.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
