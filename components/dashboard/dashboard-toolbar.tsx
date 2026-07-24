"use client";

import React from "react";
import { Search, RotateCw, Play, Download } from "lucide-react";

interface DashboardToolbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSync: () => void;
  isSyncing: boolean;
  onGenerateSelected: () => void;
  onExportReport: () => void;
  selectedCount: number;
}

export default function DashboardToolbar({
  searchQuery,
  onSearchChange,
  onSync,
  isSyncing,
  onGenerateSelected,
  onExportReport,
  selectedCount,
}: DashboardToolbarProps) {
  return (
    <div className="w-full flex flex-col gap-4">
      {/* Search Input Box */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <div className="relative">
          <Search className="absolute left-4 top-3 h-5 w-5 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by Docket Number, Party Name..."
            className="w-full pl-11 pr-4 py-2.5 bg-[#f8fafc] border border-gray-200 rounded-lg text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          />
        </div>
      </div>

      {/* Action Toolbar Row */}
      <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        {/* Left Action: Sync Smartsheet */}
        <button
          onClick={onSync}
          disabled={isSyncing}
          className="border border-gray-300 bg-white hover:bg-gray-50 active:bg-gray-100 text-gray-700 font-semibold text-sm px-4 py-2 rounded-lg flex items-center justify-center gap-2 shadow-sm transition-colors disabled:opacity-75"
        >
          <RotateCw className={`w-4 h-4 text-gray-600 ${isSyncing ? "animate-spin" : ""}`} />
          <span>Sync Smartsheet</span>
        </button>
      </div>
    </div>
  );
}
