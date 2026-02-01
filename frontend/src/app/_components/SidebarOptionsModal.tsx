"use client";

import { X, Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";

interface SidebarOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRename: () => void;
  onDelete: () => void;
  title?: string;
}

export function SidebarOptionsModal({
  isOpen,
  onClose,
  onRename,
  onDelete,
}: SidebarOptionsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
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
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div
        ref={modalRef}
        className="w-full max-w-xs overflow-hidden rounded-lg border border-slate-700 bg-slate-800 shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-slate-700 p-4">
          <h3 className="font-medium text-white">Options</h3>
          <button
            onClick={onClose}
            className="text-slate-400 transition-colors hover:text-white"
          >
            <X size={20} />
          </button>
        </div>
        <div className="flex flex-col p-2">
          <button
            onClick={() => {
              onRename();
            }}
            className="flex items-center gap-3 rounded-md p-3 text-left text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
          >
            <Pencil size={18} />
            Rename
          </button>
          <button
            onClick={() => {
              onDelete();
              onClose(); // Ideally these should be handled by parent, but for now strict parity
            }}
            className="flex items-center gap-3 rounded-md p-3 text-left text-red-400 transition-colors hover:bg-slate-700 hover:text-red-300"
          >
            <Trash2 size={18} />
            Delete Chat
          </button>
        </div>
      </div>
    </div>
  );
}
