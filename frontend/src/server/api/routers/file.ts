import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { files, conversations } from "~/server/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { pythonApi } from "~/lib/python-api";

export const fileRouter = createTRPCRouter({
  create: protectedProcedure
    .input(
      z.object({
        name: z.string(),
        url: z.string().url(),
        key: z.string(),
        conversationId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify conversation belongs to user
      const conversation = await ctx.db.query.conversations.findFirst({
        where: and(
          eq(conversations.id, input.conversationId),
          eq(conversations.userId, ctx.session.user.id),
        ),
      });

      if (!conversation) {
        throw new Error("Unauthorized or conversation not found");
      }

      const [createdFile] = await ctx.db
        .insert(files)
        .values({
          name: input.name,
          url: input.url,
          key: input.key,
          conversationId: input.conversationId,
        })
        .returning();

      if (!createdFile) {
        throw new Error("Failed to create file in db");
      }

      await pythonApi.indexFile(
        input.name,
        createdFile.id,
        input.url,
        input.conversationId,
      );

      return createdFile;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // We need to check if the file belongs to a conversation owned by the user
      // But we can just try to delete where conversationId matches...
      // A more robust way:
      const file = await ctx.db.query.files.findFirst({
        where: eq(files.id, input.id),
        with: {
          conversation: true,
        },
      });

      if (!file || file.conversation.userId !== ctx.session.user.id) {
        throw new Error("Unauthorized or file not found");
      }

      await ctx.db.delete(files).where(eq(files.id, input.id));
      void pythonApi.deleteFile(input.id, file.conversationId);
    }),

  getByConversation: protectedProcedure
    .input(z.object({ conversationId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Verify conversation ownership
      const conversation = await ctx.db.query.conversations.findFirst({
        where: and(
          eq(conversations.id, input.conversationId),
          eq(conversations.userId, ctx.session.user.id),
        ),
      });

      if (!conversation) {
        return [];
      }

      return ctx.db.query.files.findMany({
        where: eq(files.conversationId, input.conversationId),
        orderBy: [desc(files.createdAt)],
      });
    }),
});
