"use client";

import React, { useState, useRef } from "react";
import { X, UploadCloud, FileSpreadsheet, Trash2 } from "lucide-react";

interface UploadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  docketId: string;
  docketNumber: string;
  currentFiles: string[];
  onSaveFiles: (docketId: string, files: string[]) => void;
}

export default function UploadDialog({
  isOpen,
  onClose,
  docketId,
  docketNumber,
  currentFiles,
  onSaveFiles,
}: UploadDialogProps) {
  const [files, setFiles] = useState<string[]>(currentFiles);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    const excelFiles = droppedFiles
      .filter((file) => file.name.endsWith(".xlsx") || file.name.endsWith(".xls"))
      .map((file) => file.name);

    if (excelFiles.length > 0) {
      setFiles((prev) => [...prev, ...excelFiles]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      const excelFiles = selectedFiles.map((file) => file.name);
      setFiles((prev) => [...prev, ...excelFiles]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleSave = () => {
    onSaveFiles(docketId, files);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-xs transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 z-10 overflow-hidden transform transition-all duration-300 flex flex-col border border-gray-100">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-150 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Upload Excel Files</h3>
            <p className="text-xs text-gray-500 mt-0.5">Docket Number: <span className="font-semibold text-gray-700">{docketNumber || "N/A"}</span></p>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 rounded-lg p-1 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 flex flex-col gap-5 max-h-[60vh] overflow-y-auto">
          {/* Hidden File Input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            multiple
            accept=".xlsx,.xls"
            className="hidden"
          />

          {/* Drag & Drop Area */}
          <div
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={triggerFileSelect}
            className="border-2 border-dashed border-blue-200 hover:border-blue-400 rounded-xl p-8 flex flex-col items-center justify-center gap-2 cursor-pointer bg-blue-50/20 hover:bg-blue-50/50 transition-all duration-200 group text-center"
          >
            <div className="p-3 bg-blue-50 rounded-full text-blue-500 group-hover:scale-105 transition-transform duration-200">
              <UploadCloud className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-700">
                Click to upload or drag & drop
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Only Excel files (.xlsx, .xls) are supported
              </p>
            </div>
          </div>

          {/* File List */}
          <div>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Uploaded Files ({files.length})
            </h4>
            {files.length === 0 ? (
              <div className="text-center py-6 border border-dashed border-gray-100 rounded-xl bg-gray-50/30">
                <FileSpreadsheet className="w-8 h-8 text-gray-300 mx-auto mb-1.5" />
                <p className="text-xs text-gray-500">No files uploaded yet</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
                {files.map((filename, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-gray-50 border border-gray-150 rounded-lg hover:border-gray-200 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileSpreadsheet className="w-4 h-4 text-[#107c41] shrink-0" />
                      <span className="text-xs font-medium text-gray-700 truncate">
                        {filename}
                      </span>
                    </div>
                    <button
                      onClick={() => removeFile(index)}
                      className="text-gray-400 hover:text-red-500 p-1 rounded-md hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-150 bg-gray-50 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-semibold rounded-lg bg-white hover:bg-gray-50 active:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
