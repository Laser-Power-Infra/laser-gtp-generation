"use client";

import React, { useMemo, useState } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown, Filter } from "lucide-react";
import { Popover } from "@base-ui/react/popover";
import { COLUMNS, columnValue } from "./data-table-container";
import { useAppSelector, useAppDispatch } from "@/store/hooks";
import { useFilterInput } from "@/hooks/useFilterInput";
import { useColumnResize } from "@/hooks/useColumnResize";
import { setColumnValues } from "@/store/slices/filtersSlice";
import { selectAllRecords, selectRecordOrientations } from "@/store/slices/dataSlice";
import { Checkbox } from "@/components/ui/checkbox";
import type { SortDirection, TextFilterField } from "@/types";

interface HeaderProps {
  sortField: string;
  sortDirection: SortDirection;
  onSort: (field: string) => void;
  columnWidths: Record<number, number>;
}

// A docket-number list has thousands of values; show the first matches and let the search narrow it.
const MAX_OPTIONS_SHOWN = 200;
const NO_VALUES: string[] = [];

function TextFilter({ columnKey }: { columnKey: TextFilterField }) {
  const filterValue = useAppSelector((s) => s.filters[columnKey]);
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

/** The list inside a column's filter dropdown. Mounted only while open, so values are collected on demand. */
function ValueFilterList({ columnKey, selected }: { columnKey: string; selected: string[] }) {
  const dispatch = useAppDispatch();
  const records = useAppSelector(selectAllRecords);
  const orientations = useAppSelector(selectRecordOrientations);
  const [search, setSearch] = useState("");

  const options = useMemo(() => {
    const values = new Set<string>();
    for (const rec of records) values.add(columnValue(rec, columnKey, orientations));
    return Array.from(values).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  }, [records, columnKey, orientations]);

  const wanted = search.trim().toLowerCase();
  const matching = wanted ? options.filter((o) => o.toLowerCase().includes(wanted)) : options;
  const shown = matching.slice(0, MAX_OPTIONS_SHOWN);

  const toggle = (value: string) =>
    dispatch(
      setColumnValues({
        key: columnKey,
        values: selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value],
      })
    );

  return (
    <div className="flex flex-col gap-2 p-2 w-64 normal-case tracking-normal font-normal text-xs text-foreground">
      {options.length > 8 && (
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search values..."
          autoFocus
          className="h-7 rounded border border-input bg-background px-2 text-xs w-full"
        />
      )}

      <div className="max-h-60 overflow-y-auto flex flex-col">
        {shown.map((option) => (
          <label key={option} className="flex items-center gap-2 px-1 py-1 rounded cursor-pointer hover:bg-muted">
            <Checkbox checked={selected.includes(option)} onCheckedChange={() => toggle(option)} />
            <span className={`truncate ${option === "" ? "italic text-muted-foreground" : ""}`} title={option}>
              {option === "" ? "(Blank)" : option}
            </span>
          </label>
        ))}
        {shown.length === 0 && <span className="px-1 py-2 text-muted-foreground">No matching values</span>}
      </div>

      <div className="flex items-center justify-between border-t border-border pt-2 text-[11px] text-muted-foreground">
        <span>
          {matching.length > shown.length
            ? `Showing ${shown.length} of ${matching.length} – search to narrow`
            : `${selected.length} selected`}
        </span>
        <button
          onClick={() => dispatch(setColumnValues({ key: columnKey, values: [] }))}
          disabled={selected.length === 0}
          className="font-semibold text-[#0f62fe] hover:underline cursor-pointer disabled:text-muted-foreground disabled:no-underline disabled:cursor-not-allowed"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

function ValueFilter({ columnKey, label }: { columnKey: string; label: string }) {
  const selected = useAppSelector((s) => s.filters.values[columnKey] ?? NO_VALUES);
  const active = selected.length > 0;

  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={`Filter ${label}${active ? ` (${selected.length} selected)` : ""}`}
        title={active ? `Filtered: ${selected.map((v) => v || "(Blank)").join(", ")}` : `Filter ${label}`}
        className={`shrink-0 rounded p-1 cursor-pointer transition-colors ${
          active ? "bg-[#0f62fe] text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        <Filter className="w-3 h-3" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={4} className="isolate z-50">
          <Popover.Popup className="rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none">
            <ValueFilterList columnKey={columnKey} selected={selected} />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function DataTableHeader({ sortField, sortDirection, onSort, columnWidths }: HeaderProps) {
  const handleMouseDown = useColumnResize();

  return (
    <thead>
      <tr>
        {COLUMNS.map((col, idx) => {
          const width = columnWidths[idx] ?? col.width;
          const sorted = sortField === col.key ? sortDirection : null;
          return (
            <th
              key={idx}
              aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
              className="relative py-2.5 px-3 sticky top-0 z-30 bg-muted/90 text-[10px] font-bold tracking-wider text-muted-foreground uppercase border-r border-b border-border align-top"
              style={width ? { width } : undefined}
            >
              <div className="flex items-start justify-between gap-1">
                {col.sortable ? (
                  <button
                    onClick={() => onSort(col.key)}
                    title={`Sort by ${col.label}`}
                    className="flex items-center gap-1 text-left uppercase font-bold tracking-wider cursor-pointer select-none hover:text-accent-foreground"
                  >
                    {col.label}
                    {sorted === "asc" ? (
                      <ChevronUp className="w-3 h-3 shrink-0 text-[#0f62fe]" />
                    ) : sorted === "desc" ? (
                      <ChevronDown className="w-3 h-3 shrink-0 text-[#0f62fe]" />
                    ) : (
                      <ChevronsUpDown className="w-3 h-3 shrink-0 opacity-40" />
                    )}
                  </button>
                ) : (
                  <span>{col.label}</span>
                )}
                <ValueFilter columnKey={col.key} label={col.label} />
              </div>

              {col.filterType === "text" && (
                <div className="mt-1.5">
                  <TextFilter columnKey={col.key as TextFilterField} />
                </div>
              )}

              <div
                onMouseDown={(e) => handleMouseDown(e, idx, e.currentTarget.parentElement?.offsetWidth ?? width ?? 100)}
                className="absolute right-0 top-0 h-full w-[6px] cursor-col-resize hover:bg-[#0f62fe] hover:opacity-50 transition-colors z-40"
              />
            </th>
          );
        })}
      </tr>
    </thead>
  );
}
