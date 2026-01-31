"use client";

import { useUploadThing } from "~/utils/uploadthing";

interface MixedUploaderProps {
  onUploadSuccess: (
    files: { key: string; url: string; name: string }[],
  ) => void;
  availability: number;
}

// Comprehensive list of text-based formats and PDF
const ACCEPTED_FILES = [
  "application/pdf",
  "text/*", // Covers .txt, .csv, .html, .css, etc.
].join(",");

export default function MixedUploader({
  onUploadSuccess,
  availability,
}: MixedUploaderProps) {
  const { startUpload, isUploading } = useUploadThing("mixedUploader", {
    onClientUploadComplete: (uploadedFiles) => {
      onUploadSuccess(uploadedFiles);
    },
    onUploadError: (error) => {
      alert(`Error: ${error.message}`);
    },
  });

  return (
    <div>
      <label className="cursor-pointer rounded bg-blue-500 px-4 py-2 text-white transition-colors hover:bg-blue-600">
        {isUploading ? "Uploading..." : `Upload`}
        <input
          type="file"
          className="hidden"
          multiple
          // Updated accept attribute
          accept={ACCEPTED_FILES}
          onChange={async (e) => {
            if (!e.target.files) return;
            const files = Array.from(e.target.files);
            if (files.length > availability) {
              alert(`Too many files. You can only add ${availability} more.`);
              return;
            }
            await startUpload(files);
          }}
        />
      </label>
    </div>
  );
}
