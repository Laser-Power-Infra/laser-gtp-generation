"use client";

import React, { useMemo } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { COLUMNS } from "./data-table-container";
import { useAppSelector, useAppDispatch } from "@/store/hooks";
import { useFilterInput } from "@/hooks/useFilterInput";
import { useColumnResize } from "@/hooks/useColumnResize";
import { setFilter } from "@/store/slices/filtersSlice";
import { selectAllDenormalized } from "@/store/slices/dataSlice";
import type { SortDirection, FiltersState } from "@/types";

interface HeaderProps {
  sortField: string;
  sortDirection: SortDirection;
  onSort: (field: string) => void;
  columnWidths: Record<number, number>;
}

function TextFilter({ columnKey }: { columnKey: keyof FiltersState }) {
  const filterValue = useAppSelector((s) => {
    const v = s.filters[columnKey as keyof typeof s.filters];
    return typeof v === "string" ? v : "";
  });
  const [local, setLocal] = useFilterInput(filterValue, columnKey);
  return (
    <input
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      placeholder="Search..."
      className="h-7 rounded border border-input bg-background px-2 text-[10px] w-full"
    />
  );
}

function DropdownFilter({ columnKey }: { columnKey: keyof FiltersState }) {
  const dispatch = useAppDispatch();
  const allRecords = useAppSelector(selectAllDenormalized);
  const selected = useAppSelector((s) => {
    const v = s.filters[columnKey as keyof typeof s.filters];
    return Array.isArray(v) ? v : [];
  });

  const options = useMemo(() => {
    const values = new Set<string>();
    allRecords.forEach((rec) => {
      const val = String((rec as unknown as Record<string, unknown>)[columnKey] ?? "");
      if (val) values.add(val);
    });
    return Array.from(values).sort();
  }, [allRecords, columnKey]);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    let newSelected: string[];
    if (val === "__all__") newSelected = [];
    else if (val === "__blank__") {
      newSelected = selected.includes("") ? selected.filter((s: string) => s !== "") : [...selected, ""];
    } else {
      newSelected = selected.includes(val) ? selected.filter((s: string) => s !== val) : [...selected, val];
    }
    dispatch(setFilter({ field: columnKey, value: newSelected }));
  };

  return (
    <select
      multiple
      value={selected}
      onChange={handleChange}
      className="h-20 rounded border border-input bg-background px-2 text-[10px] w-full cursor-pointer"
    >
      <option value="__all__">All</option>
      <option value="__blank__">Blank</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  );
}

export function DataTableHeader({ sortField, sortDirection, onSort, columnWidths }: HeaderProps) {
  const handleMouseDown = useColumnResize();

  return (
    <thead>
      <tr>
        {COLUMNS.map((col, idx) => (
          <th
            key={idx}
            className="relative py-2.5 px-3 sticky top-0 z-30 bg-muted/90 text-[10px] font-bold tracking-wider text-muted-foreground uppercase border-r border-b border-border"
            style={columnWidths[idx] ? { width: columnWidths[idx] } : undefined}
          >
            <div className="flex items-center justify-between gap-1">
              <span
                className={`cursor-pointer select-none flex items-center gap-1 ${col.sortable ? "hover:text-accent-foreground" : ""}`}
                onClick={() => col.sortable && onSort(col.key)}
              >
                {col.label}
                {col.sortable && sortField === col.key && sortDirection === "asc" && (
                  <ChevronUp className="w-3 h-3 text-[#0f62fe]" />
                )}
                {col.sortable && sortField === col.key && sortDirection === "desc" && (
                  <ChevronDown className="w-3 h-3 text-[#0f62fe]" />
                )}
              </span>
            </div>

            {col.filterType === "text" && (
              <div className="mt-1.5">
                <TextFilter columnKey={col.key as keyof FiltersState} />
              </div>
            )}


            <div
              onMouseDown={(e) => handleMouseDown(e, idx, columnWidths[idx] || 100)}
              className="absolute right-0 top-0 h-full w-[6px] cursor-col-resize hover:bg-[#0f62fe] hover:opacity-50 transition-colors z-40"
            />
          </th>
        ))}
      </tr>
    </thead>
  );
}
