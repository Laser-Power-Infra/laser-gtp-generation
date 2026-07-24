"use client";

import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  totalRecords: number;
  shownRecordsCount: number;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({
  totalRecords,
  shownRecordsCount,
  currentPage,
  totalPages,
  onPageChange,
}: PaginationProps) {
  return (
    <div className="w-full bg-[#f4f7fc] border-t border-gray-200 px-6 py-4 flex items-center justify-between rounded-b-xl">
      <span className="text-sm font-semibold text-gray-500">
        Showing {shownRecordsCount} of {totalRecords.toLocaleString()} records
      </span>
      
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:hover:bg-white text-gray-600 p-2 rounded-lg transition-colors shadow-xs cursor-pointer disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-4 h-4 stroke-[2.5]" />
        </button>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:hover:bg-white text-gray-600 p-2 rounded-lg transition-colors shadow-xs cursor-pointer disabled:cursor-not-allowed"
        >
          <ChevronRight className="w-4 h-4 stroke-[2.5]" />
        </button>
      </div>
    </div>
  );
}
