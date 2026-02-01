"use client";

import { useEffect, useRef, useState } from "react";

interface SidebarRenameModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialName: string;
  onRename: (newName: string) => Promise<void>;
  isPending: boolean;
}

export function SidebarRenameModal({
  isOpen,
  onClose,
  initialName,
  onRename,
  isPending,
}: SidebarRenameModalProps) {
  const [newName, setNewName] = useState(initialName);
  const modalRef = useRef<HTMLFormElement>(null);

  // Reset name when opening
  useEffect(() => {
    if (isOpen) {
      setNewName(initialName);
    }
  }, [isOpen, initialName]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      // Don't close if pending (optional UX choice, keeps it safer)
      if (isPending) return;

      if (
        modalRef.current &&
        !modalRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose, isPending]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    await onRename(newName);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <form
        ref={modalRef}
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border border-slate-700 bg-slate-800 p-6 shadow-xl"
      >
        <h3 className="mb-4 text-lg font-medium text-white">Rename Chat</h3>
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="mb-4 w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
          autoFocus
          disabled={isPending}
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
            disabled={isPending}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {isPending ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
