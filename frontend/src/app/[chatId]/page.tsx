"use client";

import { useState, useRef, useEffect } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { pythonApi } from "~/lib/python-api";
import { api } from "~/trpc/react";
import { UploadButton } from "~/utils/uploadthing";
import { Send, FileText, Trash2, Paperclip, Loader2 } from "lucide-react";
import Link from "next/link";
import { marked } from 'marked';

type Message = {
  role: "user" | "assistant";
  content: string;
};

export default function ChatPage() {
  const params = useParams();
  const conversationId = params.chatId as string;
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 1. Fetch Chat History
  const { data: historyData, isLoading: isHistoryLoading } = useQuery({
    queryKey: ["chatHistory", conversationId],
    queryFn: () => pythonApi.getChatHistory(conversationId),
    refetchOnWindowFocus: false,
  });

  const [messages, setMessages] = useState<Message[]>([]);

  // Update local messages when history loads
  useEffect(() => {
    if (historyData?.history) {
      setMessages(historyData.history);
    }
  }, [historyData]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);


  // 2. Chat Mutation
  const chatMutation = useMutation({
    mutationFn: async (msg: string) => {
      // Optimistically add user message
      const userMsg: Message = { role: "user", content: msg };
      setMessages((prev) => [...prev, userMsg]);
      
      const res = await pythonApi.chat(conversationId, msg);
      return res;
    },
    onSuccess: (data) => {
      // Add assistant message
      const assistantMsg: Message = { role: "assistant", content: data.answer };
      setMessages((prev) => [...prev, assistantMsg]);
    },
    onError: (error) => {
      console.error("Chat error:", error);
      // Ideally remove optimistic message or show error
      alert("Failed to send message");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || chatMutation.isPending) return;
    
    const msg = input;
    setInput("");
    chatMutation.mutate(msg);
  };

  // 3. Files Management (tRPC + Backend)
  const utils = api.useUtils();
  const { data: files } = api.file.getByConversation.useQuery({ conversationId });
  
  const deleteFileMutation = api.file.delete.useMutation({
    onSuccess: async (_, variables) => {
      await utils.file.getByConversation.invalidate({ conversationId });
      // Also tell backend to delete (fire and forget or await?)
      // Backend delete is based on fileId.
      // Wait, we need to call python backend delete too.
    },
  });

  const deleteBackendFileMutation = useMutation({
      mutationFn: async (fileId: string) => {
          return pythonApi.deleteFile(fileId, conversationId);
      }
  });

  const handleFileDelete = async (fileId: string) => {
      if(!confirm("Delete this file?")) return;
      
      // Delete from DB
      await deleteFileMutation.mutateAsync({ id: fileId });
      // Delete from Backend Vector Store
      // Note: We should probably do this in the tRPC router to ensure consistency
      // or here. For now, here is fine.
      try {
        await deleteBackendFileMutation.mutateAsync(fileId);
      } catch (e) {
          console.error("Failed to delete from backend", e);
      }
  };

  const createFileMutation = api.file.create.useMutation({
      onSuccess: () => utils.file.getByConversation.invalidate({ conversationId })
  });
  
  const indexFileMutation = useMutation({
      mutationFn: async ({fileId, url}: {fileId: string, url: string}) => {
          return pythonApi.indexFile(fileId, url, conversationId);
      }
  });


  return (
    <div className="flex h-full">
      {/* Main Chat Area */}
      <div className="flex flex-1 flex-col relative bg-slate-950">
          {/* Header */}
          <div className="border-b border-slate-800 p-4 sticky top-0 bg-slate-950/80 backdrop-blur-md z-10">
              <h1 className="text-xl font-semibold text-white">Chat</h1>
          </div>
          
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 pb-32">
          {isHistoryLoading ? (
             <div className="flex h-full items-center justify-center">
                 <Loader2 className="animate-spin text-slate-500" />
             </div>
          ) : messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-slate-500">
                  <p className="text-lg">No messages yet.</p>
                  <p className="text-sm">Upload a document or start typing!</p>
              </div>
          ) : (
            <div className="flex flex-col gap-6 max-w-3xl mx-auto">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-4 ${
                    msg.role === "user" ? "flex-row-reverse" : ""
                  }`}
                >
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                      msg.role === "user" ? "bg-blue-600" : "bg-emerald-600"
                    }`}
                  >
                    {msg.role === "user" ? "U" : "AI"}
                  </div>
                  <div
                    className={`rounded-lg px-4 py-2 max-w-[80%] ${
                      msg.role === "user"
                        ? "bg-blue-600/20 text-blue-100"
                        : "bg-slate-800 text-slate-200"
                    }`}
                  >
                     <div dangerouslySetInnerHTML={{ __html: marked(msg.content) }} className="prose prose-invert prose-sm" />
                  </div>
                </div>
              ))}
              {chatMutation.isPending && (
                  <div className="flex gap-4">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600">AI</div>
                      <div className="rounded-lg px-4 py-2 bg-slate-800 text-slate-200">
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
        <div className="p-4 border-t border-slate-800 bg-slate-950 absolute bottom-0 w-full">
            <div className="max-w-3xl mx-auto">
                <form onSubmit={handleSubmit} className="flex gap-2">
                    <input 
                        type="text" 
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask a question about your documents..."
                        className="flex-1 rounded-md bg-slate-900 border border-slate-700 px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <button 
                        type="submit"
                        disabled={!input.trim() || chatMutation.isPending}
                        className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Send size={20} />
                    </button>
                </form>
            </div>
        </div>
      </div>

      {/* Files Panel (Right Sidebar) */}
      <div className="w-80 border-l border-slate-800 bg-slate-900/50 p-4 overflow-y-auto">
          <h2 className="mb-4 text-lg font-semibold text-white flex items-center gap-2">
              <Paperclip size={20} />
              Files
          </h2>
          
          <div className="mb-6">
              <UploadButton
                endpoint="fileUploader"
                onClientUploadComplete={async (res) => {
                  if (res && res.length > 0) {
                      const file = res[0]!;
                      // 1. Create in DB
                      const createdFile = await createFileMutation.mutateAsync({
                          name: file.name,
                          url: file.url,
                          key: file.key,
                          conversationId
                      });
                      
                      // 2. Index in Backend
                      if (createdFile) {
                          try {
                              await indexFileMutation.mutateAsync({
                                  fileId: createdFile.id,
                                  url: file.url
                              });
                          } catch (e) {
                              console.error("Failed to index file", e);
                              alert("File uploaded but failed to index in AI backend.");
                          }
                      }
                  }
                  alert("Upload Completed");
                }}
                onUploadError={(error: Error) => {
                  alert(`ERROR! ${error.message}`);
                }}
                appearance={{
                    button: "bg-slate-700 text-white hover:bg-slate-600 w-full text-sm py-2",
                    allowedContent: "text-slate-400 text-xs"
                }}
              />
          </div>

          <div className="flex flex-col gap-2">
              {files?.map((file) => (
                  <div key={file.id} className="group relative flex items-center gap-2 rounded-md bg-slate-800 p-2 text-sm text-slate-300">
                      <FileText size={16} className="shrink-0" />
                      <a href={file.url} target="_blank" rel="noopener noreferrer" className="truncate hover:underline">
                          {file.name}
                      </a>
                      <button 
                        onClick={() => handleFileDelete(file.id)}
                        className="absolute right-2 hidden text-red-400 hover:text-red-300 group-hover:block"
                      >
                          <Trash2 size={16} />
                      </button>
                  </div>
              ))}
              {files?.length === 0 && (
                  <p className="text-center text-xs text-slate-500">No files uploaded.</p>
              )}
          </div>
      </div>
    </div>
  );
}
