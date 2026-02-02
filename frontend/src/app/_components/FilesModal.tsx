"use client";

import { X, Trash2, Loader2, Paperclip } from "lucide-react";
import MixedUploader from "./MixedUploader";

interface FilesModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: { id: string; name: string; url: string; key: string }[];
  isFilesLoading: boolean;
  isFilesError: boolean;
  onDelete: (fileId: string) => void;
  onUploadSuccess: (
    files: { key: string; url: string; name: string }[],
    toastId: string,
  ) => void;
  isProcessing: boolean;
  availability: number;
}

export default function FilesModal({
  isOpen,
  onClose,
  files,
  isFilesLoading,
  isFilesError,
  onDelete,
  onUploadSuccess,
  isProcessing,
  availability,
}: FilesModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 p-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
            <Paperclip className="h-5 w-5 md:h-6 md:w-6" />
            Manage Files
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4">
          {isFilesLoading ? (
            <div className="flex w-full flex-col items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-800 py-6">
              <Loader2 className="animate-spin text-blue-500" size={24} />
              <span className="mt-2 text-sm text-slate-400">
                Loading files...
              </span>
            </div>
          ) : isFilesError ? (
            <div className="flex w-full flex-col items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-800 py-6">
              <X className="text-red-500" size={24} />
              <span className="mt-2 text-sm text-slate-400">
                Failed to load files
              </span>
            </div>
          ) : (
            <>
              {" "}
              {/* Upload Section */}
              <div className="mb-6">
                <h3 className="mb-2 text-sm font-medium text-slate-400">
                  Upload New Files
                </h3>
                {isProcessing ? (
                  <div className="flex w-full flex-col items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-800 py-6">
                    <Loader2 className="animate-spin text-blue-500" size={24} />
                    <span className="mt-2 text-sm text-slate-400">
                      Processing files...
                    </span>
                  </div>
                ) : (
                  <MixedUploader
                    onUploadSuccess={onUploadSuccess}
                    availability={availability}
                  />
                )}
              </div>
              {/* Files List */}
              <div>
                <h3 className="mb-2 text-sm font-medium text-slate-400">
                  Uploaded Files ({files.length}/4)
                </h3>
                <div className="scrollbar-thin scrollbar-track-slate-800 scrollbar-thumb-slate-600 flex max-h-60 flex-col gap-2 overflow-y-auto pr-1">
                  {files.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-800 p-4 text-center text-sm text-slate-500">
                      No files uploaded yet.
                    </div>
                  ) : (
                    files.map((file) => {
                      const fileName = file.name;
                      const lastDotIndex = fileName.lastIndexOf(".");
                      const name =
                        lastDotIndex !== -1
                          ? fileName.substring(0, lastDotIndex)
                          : fileName;
                      const extension =
                        lastDotIndex !== -1
                          ? fileName.substring(lastDotIndex)
                          : null;
                      return (
                        <div
                          key={file.id}
                          className="group relative flex items-center justify-between gap-2 rounded-md border border-slate-700/50 bg-slate-800 p-3 text-sm text-slate-300"
                        >
                          <a
                            href={file.url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex flex-1 items-center gap-2 truncate hover:text-blue-400 hover:underline"
                            title={file.name}
                          >
                            <span className="truncate font-medium">{name}</span>
                            {extension && (
                              <span className="flex-none opacity-70">
                                {extension}
                              </span>
                            )}
                          </a>
                          <button
                            onClick={() => onDelete(file.id)}
                            className="flex-none rounded p-1 text-slate-500 transition-colors hover:bg-slate-700/50 hover:text-red-400"
                            title="Delete file"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
