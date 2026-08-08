"use client";

import React, { useState } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import { useAppDispatch } from "@/store/hooks";
import { updateRecordField } from "@/store/slices/dataSlice";

interface TitleBlockDialogProps {
  isOpen: boolean;
  onClose: () => void;
  recordId: string;
  mode: "standard" | "custom" | "none";
  customRows: Array<{ label: string; value: string }>;
}

const MODE_OPTIONS: Array<{ value: "standard" | "custom" | "none"; label: string; description: string }> = [
  { value: "standard", label: "Standard", description: "OWNER / PROJECT / CONTRACTOR / LOI NO." },
  { value: "custom", label: "Custom", description: "Define your own label/value rows" },
  { value: "none", label: "None", description: "No title block in the header" },
];

export default function TitleBlockDialog({
  isOpen,
  onClose,
  recordId,
  mode,
  customRows,
}: TitleBlockDialogProps) {
  const dispatch = useAppDispatch();
  const [selectedMode, setSelectedMode] = useState<"standard" | "custom" | "none">(mode);
  const [rows, setRows] = useState<Array<{ label: string; value: string }>>(
    customRows.length > 0 ? customRows.map((r) => ({ ...r })) : [{ label: "", value: "" }]
  );

  if (!isOpen) return null;

  const updateRow = (index: number, field: "label" | "value", value: string) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const addRow = () => {
    setRows((prev) => [...prev, { label: "", value: "" }]);
  };

  const handleSave = async () => {
    const cleanRows = rows.filter((r) => r.label.trim() !== "" || r.value.trim() !== "");
    await dispatch(updateRecordField({ id: recordId, field: "titleBlockMode", value: selectedMode }));
    if (selectedMode === "custom") {
      await dispatch(
        updateRecordField({ id: recordId, field: "titleBlockCustomRows", value: cleanRows })
      );
    }
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
            <h3 className="text-lg font-bold text-gray-900">Title Block</h3>
            <p className="text-xs text-gray-500 mt-0.5">Customize the title block shown in the document header</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 rounded-lg p-1 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 flex flex-col gap-5 max-h-[65vh] overflow-y-auto">
          {/* Mode selector */}
          <div>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Title Block Type
            </h4>
            <div className="grid grid-cols-3 gap-2">
              {MODE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSelectedMode(opt.value)}
                  className={`text-left p-3 rounded-xl border transition-all cursor-pointer ${
                    selectedMode === opt.value
                      ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500"
                      : "border-gray-200 hover:border-gray-300 bg-white"
                  }`}
                >
                  <p className={`text-sm font-semibold ${selectedMode === opt.value ? "text-blue-700" : "text-gray-700"}`}>
                    {opt.label}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-1 leading-snug">{opt.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Custom rows */}
          {selectedMode === "custom" && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Custom Rows
                </h4>
                <button
                  onClick={addRow}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#0f62fe] hover:text-[#1d4ed8] cursor-pointer px-1.5 py-0.5 rounded hover:bg-blue-50 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Row
                </button>
              </div>

              <div className="flex flex-col gap-2">
                {rows.map((row, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={row.label}
                      onChange={(e) => updateRow(index, "label", e.target.value)}
                      placeholder="Label"
                      className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white"
                    />
                    <input
                      type="text"
                      value={row.value}
                      onChange={(e) => updateRow(index, "value", e.target.value)}
                      placeholder="Value"
                      className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white"
                    />
                    <button
                      onClick={() => removeRow(index)}
                      disabled={rows.length === 1}
                      className="text-gray-400 hover:text-red-500 p-1.5 rounded-md hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedMode === "standard" && (
            <div className="text-center py-6 border border-dashed border-gray-100 rounded-xl bg-gray-50/30">
              <p className="text-xs text-gray-500">
                The standard title block will be used: <span className="font-semibold text-gray-700">OWNER, PROJECT, CONTRACTOR, LOI NO.</span>
              </p>
            </div>
          )}

          {selectedMode === "none" && (
            <div className="text-center py-6 border border-dashed border-gray-100 rounded-xl bg-gray-50/30">
              <p className="text-xs text-gray-500">No title block will be rendered in the document header.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-150 bg-gray-50 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-semibold rounded-lg bg-white hover:bg-gray-50 active:bg-gray-100 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm cursor-pointer"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
