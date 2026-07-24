"use client";

import React from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setPage, setPageSize, nextPage, prevPage } from "@/store/slices/paginationSlice";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalRecords: number;
}

function getPageNumbers(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "ellipsis")[] = [1];
  if (current > 3) pages.push("ellipsis");
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) pages.push(i);
  if (current < total - 2) pages.push("ellipsis");
  pages.push(total);
  return pages;
}

export function DataTablePagination({ currentPage, totalPages, totalRecords }: PaginationProps) {
  const dispatch = useAppDispatch();
  const pageSize = useAppSelector((s) => s.pagination.pageSize);

  const startRecord = (currentPage - 1) * pageSize + 1;
  const endRecord = Math.min(currentPage * pageSize, totalRecords);

  return (
    <div className="flex items-center justify-between px-3 py-2 border-t border-border bg-muted/30">
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          Showing {totalRecords > 0 ? `${startRecord}-${endRecord}` : "0"} of {totalRecords} results
        </span>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Rows:</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => dispatch(setPageSize(Number(v)))}
          >
            <SelectTrigger className="h-6 w-[60px] text-[10px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[5, 10, 20, 50, 100, 500].map((size) => (
                <SelectItem key={size} value={String(size)} className="text-xs">
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={currentPage <= 1}
          onClick={() => dispatch(setPage(1))}
        >
          <ChevronsLeft className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={currentPage <= 1}
          onClick={() => dispatch(prevPage())}
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </Button>

        {getPageNumbers(currentPage, totalPages).map((page, idx) =>
          page === "ellipsis" ? (
            <span key={`e-${idx}`} className="px-1 text-xs text-muted-foreground">...</span>
          ) : (
            <Button
              key={page}
              variant={page === currentPage ? "default" : "ghost"}
              size="icon-xs"
              onClick={() => dispatch(setPage(page))}
              className={page === currentPage ? "bg-[#0f62fe] text-white hover:bg-[#0f62fe]/90" : ""}
            >
              {page}
            </Button>
          )
        )}

        <Button
          variant="ghost"
          size="icon-xs"
          disabled={currentPage >= totalPages}
          onClick={() => dispatch(nextPage())}
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={currentPage >= totalPages}
          onClick={() => dispatch(setPage(totalPages))}
        >
          <ChevronsRight className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
