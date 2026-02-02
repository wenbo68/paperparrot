import { and, eq } from "drizzle-orm";
import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import z from "zod";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { conversations } from "~/server/db/schema";

const f = createUploadthing();

// FileRouter for your app, can contain multiple FileRoutes
export const ourFileRouter = {
  // Define as many FileRoutes as you like, each with a unique routeSlug
  imageUploader: f({ image: { maxFileSize: "4MB" } })
    // Set permissions and file types for this FileRoute
    .middleware(async ({ req }) => {
      // This code runs on your server before upload
      const session = await auth();

      // If you throw, the user will not be able to upload
      if (!session?.user) throw new UploadThingError("Unauthorized");

      // Whatever is returned here is accessible in onUploadComplete as `metadata`
      return { userId: session.user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      // // This code RUNS ON YOUR SERVER after upload
      // console.log("Upload complete for userId:", metadata.userId);
      // console.log("file url", file.ufsUrl);

      // !!! Whatever is returned here is sent to the clientside `onClientUploadComplete` callback
      return {
        uploadedBy: metadata.userId,
        url: file.ufsUrl,
        name: file.name,
        key: file.key,
      };
    }),

  mixedUploader: f({
    blob: { maxFileSize: "4MB", maxFileCount: 4 },
  })
    // 1. REQUIRE conversationId from the client
    .input(z.object({ conversationId: z.string().uuid() }))
    .middleware(async ({ req, input }) => {
      // <--- Destructure 'input'
      const session = await auth();
      if (!session?.user) throw new UploadThingError("Unauthorized");

      // 2. VERIFY the conversation exists and belongs to this user
      const conversation = await db.query.conversations.findFirst({
        where: and(
          eq(conversations.id, input.conversationId),
          eq(conversations.userId, session.user.id),
        ),
      });

      // 3. BLOCK the upload if invalid
      if (!conversation) {
        throw new UploadThingError("Invalid Conversation ID");
      }

      // Return metadata for the onUploadComplete callback
      return {
        userId: session.user.id,
        conversationId: input.conversationId,
      };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      // Safe to return info now
      return {
        url: file.ufsUrl,
        name: file.name,
        key: file.key,
        // You could even run your DB insert here if you wanted to be 100% atomic!
      };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
