import { z } from 'zod';

import { createTRPCRouter, protectedProcedure } from '~/server/api/trpc';
import { conversations } from '~/server/db/schema';
import { eq, desc, and } from 'drizzle-orm';

export const conversationRouter = createTRPCRouter({
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1, 'Invalid name'),
        id: z.string().uuid().min(1, 'Invalid id'),
      })
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

  getAll: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.conversations.findMany({
      where: eq(conversations.userId, ctx.session.user.id),
      orderBy: [desc(conversations.updatedAt ?? conversations.createdAt)],
    });
  }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().min(1, 'Invalid id') }))
    .mutation(async ({ ctx, input }) => {
      // Ensure user owns the conversation
      await ctx.db
        .delete(conversations)
        .where(
          and(
            eq(conversations.id, input.id),
            eq(conversations.userId, ctx.session.user.id)
          )
        );
      // Note: files cascade delete in DB
    }),

  rename: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1, 'Invalid id'),
        name: z.string().min(1, 'Invalid name'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [conversation] = await ctx.db
        .update(conversations)
        .set({ name: input.name })
        .where(
          and(
            eq(conversations.id, input.id),
            eq(conversations.userId, ctx.session.user.id)
          )
        )
        .returning();
      return conversation;
    }),
});
