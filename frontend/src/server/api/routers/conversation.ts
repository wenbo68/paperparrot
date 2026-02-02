import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { conversations } from "~/server/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { pythonApi } from "~/lib/python-api";
import { TRPCError } from "@trpc/server";

export const conversationRouter = createTRPCRouter({
  getAll: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.conversations.findMany({
      where: eq(conversations.userId, ctx.session.user.id),
      orderBy: [desc(conversations.updatedAt ?? conversations.createdAt)],
    });
  }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1, "Invalid name"),
        id: z.string().uuid().min(1, "Invalid id"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [conversation] = await ctx.db
        .insert(conversations)
        .values({
          id: input.id,
          name: input.name,
          userId: ctx.session.user.id,
        })
        .returning();
      return conversation;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().min(1, "Invalid id") }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db
        .delete(conversations)
        .where(
          and(
            eq(conversations.id, input.id),
            eq(conversations.userId, ctx.session.user.id),
          ),
        )
        .returning();

      if (!deleted) {
        throw new Error("Unauthorized or conversation not found");
      }

      void pythonApi.deleteConversation(input.id);
    }),

  rename: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1, "Invalid id"),
        name: z.string().min(1, "Invalid name"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [conversation] = await ctx.db
        .update(conversations)
        .set({ name: input.name })
        .where(
          and(
            eq(conversations.id, input.id),
            eq(conversations.userId, ctx.session.user.id),
          ),
        )
        .returning();
      return conversation;
    }),

  // NEW: Secure History Fetch
  getHistory: protectedProcedure
    .input(z.object({ conversationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // 1. Verify ownership
      const conversation = await ctx.db.query.conversations.findFirst({
        where: and(
          eq(conversations.id, input.conversationId),
          eq(conversations.userId, ctx.session.user.id),
        ),
      });

      if (!conversation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversation not found or unauthorized",
        });
      }

      // 2. Fetch from Python API
      try {
        return await pythonApi.getChatHistory(input.conversationId);
      } catch (error) {
        console.error("Failed to fetch history:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to load chat history",
        });
      }
    }),

  // NEW: Secure Proxy for Chatting
  sendMessage: protectedProcedure
    .input(
      z.object({
        conversationId: z.string().uuid(),
        message: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // 1. GATEKEEPER: Verify conversation exists and belongs to user
      const conversation = await ctx.db.query.conversations.findFirst({
        where: and(
          eq(conversations.id, input.conversationId),
          eq(conversations.userId, ctx.session.user.id),
        ),
      });

      if (!conversation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversation not found or unauthorized",
        });
      }

      // 2. PROXY: Call Python API securely from the server
      // The Python API now trusts the Next.js server, not the random client
      try {
        const response = await pythonApi.chat(
          input.conversationId,
          input.message,
        );
        return response;
      } catch (error) {
        console.error("Python API Error:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to communicate with AI service",
        });
      }
    }),
});
