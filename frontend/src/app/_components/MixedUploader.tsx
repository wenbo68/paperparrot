"use client";

import { useUploadThing } from "~/utils/uploadthing";

interface MixedUploaderProps {
  // uploadThingRoute: UploadThingRoute;
  onUploadSuccess: (
    files: { key: string; url: string; name: string }[],
  ) => void;
  availability: number;
}

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
      <label className="cursor-pointer rounded bg-blue-500 px-4 py-2 text-white">
        {isUploading ? "Uploading..." : `Upload`}
        <input
          type="file"
          className="hidden"
          multiple
          accept="image/*, application/pdf, text/plain, application/json"
          onChange={async (e) => {
            if (!e.target.files) return;
            // Convert FileList to Array
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
