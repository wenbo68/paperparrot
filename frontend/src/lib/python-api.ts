import { env } from "~/env";

export type ChatResponse = {
  answer: string;
  sources: "internet" | "documents";
};

export type IndexFileResponse = {
  status: "success" | "error";
  message: string;
};

export type DeleteFileResponse = {
  status: "success" | "error";
  message: string;
};

export type ChatHistoryResponse = {
  history: {
    role: "user" | "assistant";
    content: string;
  }[];
};

const BASE_URL = env.NEXT_PUBLIC_API_URL;

export const pythonApi = {
  chat: async (conversationId: string, message: string): Promise<ChatResponse> => {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: conversationId, message }),
    });
    if (!res.ok) throw new Error("Failed to send message");
    return res.json() as Promise<ChatResponse>;
  },

  indexFile: async (fileId: string, fileUrl: string, conversationId: string): Promise<IndexFileResponse> => {
    const res = await fetch(`${BASE_URL}/api/index-file`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: fileId, file_url: fileUrl, conversation_id: conversationId }),
    });
    if (!res.ok) throw new Error("Failed to index file");
    return res.json() as Promise<IndexFileResponse>;
  },

  deleteFile: async (fileId: string, conversationId: string): Promise<DeleteFileResponse> => {
    const res = await fetch(`${BASE_URL}/api/delete-file`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: fileId, conversation_id: conversationId }),
    });
    if (!res.ok) throw new Error("Failed to delete file");
    return res.json() as Promise<DeleteFileResponse>;
  },

  getChatHistory: async (conversationId: string): Promise<ChatHistoryResponse> => {
    const res = await fetch(`${BASE_URL}/api/chat/${conversationId}/history`);
    if (!res.ok) throw new Error("Failed to fetch chat history");
    return res.json() as Promise<ChatHistoryResponse>;
  },
};
