"use client";

import { useRef } from "react"; //
import { useUploadThing } from "~/utils/uploadthing";
import { customToast } from "./toast";

interface MixedUploaderProps {
  // 1. Add conversationId to props
  conversationId: string;
  onUploadSuccess: (
    files: { key: string; url: string; name: string }[],
    toastId: string,
  ) => void;
  availability: number;
}

const ACCEPTED_FILES = ["application/pdf", "text/*"].join(",");

export default function MixedUploader({
  conversationId, // <--- Destructure it
  onUploadSuccess,
  availability,
}: MixedUploaderProps) {
  const toastIdRef = useRef<string>("");

  const { startUpload, isUploading } = useUploadThing("mixedUploader", {
    onClientUploadComplete: (uploadedFiles) => {
      onUploadSuccess(uploadedFiles, toastIdRef.current);
    },
    onUploadError: (error) => {
      customToast.error(`Error: ${error.message}`, toastIdRef.current);
    },
  });

  return (
    <div>
      <label className="cursor-pointer rounded bg-blue-500 px-4 py-2 text-gray-300 transition-colors hover:bg-blue-600">
        {isUploading ? "Uploading..." : `Upload`}
        <input
          type="file"
          className="hidden"
          multiple
          accept={ACCEPTED_FILES}
          onChange={async (e) => {
            if (!e.target.files) return;
            const files = Array.from(e.target.files);
            if (files.length > availability) {
              alert(`Too many files. You can only add ${availability} more.`);
              return;
            }

            // 4. Trigger the toast HERE, immediately before upload starts
            toastIdRef.current = customToast.loading("Uploading files...");

            // 2. PASS the input to startUpload
            // This MUST match the .input() schema in core.ts
            await startUpload(files, {
              conversationId: conversationId,
            });
          }}
        />
      </label>
    </div>
  );
}
