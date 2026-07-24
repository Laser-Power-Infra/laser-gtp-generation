"use client";

import React from "react";
import { CheckCircle2, Upload } from "lucide-react";

interface UploadCellProps {
  files: string[];
  rowId: string;
  onUploadClick: () => void;
  onViewClick: () => void;
}

export default function UploadCell({ files, rowId, onUploadClick, onViewClick }: UploadCellProps) {
  if (files.length === 0) {
    return (
      <button
        onClick={onUploadClick}
        className="inline-flex items-center gap-1.5 bg-[#f1f5f9] hover:bg-[#e2e8f0] text-gray-700 font-semibold text-xs py-1.5 px-3 rounded-lg border border-gray-200 shadow-xs transition-colors cursor-pointer"
      >
        <Upload className="w-3.5 h-3.5 text-gray-500" />
        <span>Upload Files</span>
      </button>
    );
  }

  // Row 1 (id="1") has "View"
  // Row 2 (id="2") has "Replace"
  // Row 4 (id="4") has no link in the screenshot (just "2 files")
  // Let's make it dynamic based on row ID or custom config, defaulting to "View" if not specified.
  let actionText: "View" | "Replace" | null = "View";
  if (rowId === "2") {
    actionText = "Replace";
  } else if (rowId === "4") {
    actionText = null;
  }

  return (
    <div className="inline-flex items-center gap-2 border border-[#dbeafe] bg-[#f0f7ff] pl-2.5 pr-3 py-1 rounded-full text-xs text-blue-900 font-medium">
      <div className="flex items-center gap-1">
        <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 fill-blue-50/50" />
        <span>
          {files.length} {files.length === 1 ? "file" : "files"}
        </span>
      </div>
      
      {actionText && (
        <>
          <div className="w-px h-3.5 bg-[#bfdbfe]" />
          <button
            onClick={actionText === "View" ? onViewClick : onUploadClick}
            className="text-[#2563eb] hover:text-[#1d4ed8] font-bold hover:underline cursor-pointer"
          >
            {actionText}
          </button>
        </>
      )}
    </div>
  );
}
