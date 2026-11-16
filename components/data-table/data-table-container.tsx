"use client";

import React, { useMemo, useState, useEffect } from "react";
import { useAppSelector, useAppDispatch } from "@/store/hooks";
import {
  selectAllDenormalized, selectRecordsLoading, selectRecordsLoaded,
  selectRecordOrientations, fetchRecords,
} from "@/store/slices/dataSlice";
import { selectFilters } from "@/store/selectors/filterSelectors";
import type { FiltersState, DocketRecord, SortState, ChildItem } from "@/types";
import { DataTableHeader } from "./data-table-header";
import { DataTableRow } from "./data-table-row";
import { STAGE_LABEL } from "./review-cell";
import { DataTablePagination } from "./data-table-pagination";
import { DataTableToolbar } from "./data-table-toolbar";
import { SearchX, Loader2 } from "lucide-react";

export const COLUMNS: Array<{
  key: string; label: string; filterType: "text" | null; sortable: boolean; width?: number;
}> = [
  { key: "docketNumber", label: "Docket Number", filterType: "text" as const, sortable: true, width: 190 },
  { key: "utility", label: "Utility", filterType: null, sortable: true, width: 170 },
  { key: "partyName", label: "Party Name", filterType: "text" as const, sortable: true, width: 170 },
  { key: "projectRefNo", label: "Project Ref No", filterType: "text" as const, sortable: true, width: 130 },
  { key: "enquiryTenderNo", label: "Enquiry/Tender No", filterType: "text" as const, sortable: true, width: 140 },
  { key: "loiNo", label: "Reference No/LOI No/PO No", filterType: "text" as const, sortable: true, width: 150 },
  { key: "project", label: "Project", filterType: "text" as const, sortable: true, width: 140 },
  { key: "excelFiles", label: "Excel Files", filterType: null, sortable: true, width: 180 },
  { key: "orientation", label: "Orientation", filterType: null, sortable: true, width: 125 },
  { key: "showTitleBlock", label: "Title Block", filterType: null, sortable: true, width: 125 },
  // Wide enough for the format picker, "Generating..." and the version label.
  { key: "docxStatus", label: "Generate GTP", filterType: null, sortable: true, width: 240 },
  { key: "review", label: "Review", filterType: null, sortable: true, width: 180 },
];

// Below this the table scrolls sideways instead of squeezing the columns.
const TABLE_MIN_WIDTH = COLUMNS.reduce((sum, col) => sum + (col.width ?? 120), 0);

export const CHILD_COLUMNS = [
  { key: "itemName", label: "Item Name" },
  { key: "status", label: "Status" },
  { key: "assignedTo", label: "Assigned To" },
  { key: "dueDate", label: "Due Date" },
];

const TEXT_FILTERS = ["docketNumber", "partyName", "projectRefNo", "enquiryTenderNo", "loiNo", "project"] as const;
const TITLE_BLOCK_LABEL = { standard: "Standard", custom: "Custom", none: "None" } as const;
const REVIEW_ORDER = ["review", "approved", "client"];

type Orientations = Record<string, "portrait" | "landscape">;

/** What a column shows for a record, as text. The dropdown filters list and match these. */
export function columnValue(record: DocketRecord, key: string, orientations: Orientations): string {
  switch (key) {
    case "excelFiles": return record.excelFiles.length > 0 ? "Has files" : "No files";
    case "orientation": return orientations[record.id] === "landscape" ? "Landscape" : "Portrait";
    case "showTitleBlock": return TITLE_BLOCK_LABEL[record.titleBlockMode ?? "standard"];
    case "docxStatus": return record.generationVersion > 0 ? "Generated" : "Not generated";
    case "review": return record.review ? STAGE_LABEL[record.review.stage] : "Not sent";
    default: return String((record as unknown as Record<string, unknown>)[key] ?? "").trim();
  }
}

export function matchesFilters(record: DocketRecord, filters: FiltersState, orientations: Orientations): boolean {
  for (const field of TEXT_FILTERS) {
    const wanted = filters[field].trim().toLowerCase();
    if (wanted && !String(record[field] ?? "").toLowerCase().includes(wanted)) return false;
  }
  for (const [key, values] of Object.entries(filters.values)) {
    if (values.length > 0 && !values.includes(columnValue(record, key, orientations))) return false;
  }
  return true;
}

/** Counts sort as numbers (file count, version, review stage); everything else as text. */
function sortValue(record: DocketRecord, key: string, orientations: Orientations): string | number {
  if (key === "excelFiles") return record.excelFiles.length;
  if (key === "docxStatus") return record.generationVersion;
  if (key === "review") {
    return record.review ? (REVIEW_ORDER.indexOf(record.review.stage) + 1) * 100000 + record.review.version : 0;
  }
  return columnValue(record, key, orientations);
}

export function sortRecords<T extends DocketRecord>(records: T[], sort: SortState, orientations: Orientations): T[] {
  if (!sort.direction || !sort.field) return records;
  const sign = sort.direction === "asc" ? 1 : -1;
  return records
    .map((record) => ({ record, value: sortValue(record, sort.field, orientations) }))
    .sort((x, y) =>
      sign *
      (typeof x.value === "number" && typeof y.value === "number"
        ? x.value - y.value
        // numeric: "ENQ-999" sorts before "ENQ-1000"
        : String(x.value).localeCompare(String(y.value), undefined, { numeric: true, sensitivity: "base" }))
    )
    .map((entry) => entry.record);
}

export function DataTableContainer() {
  const dispatch = useAppDispatch();
  const allRecords = useAppSelector(selectAllDenormalized);
  const loading = useAppSelector(selectRecordsLoading);
  const loaded = useAppSelector(selectRecordsLoaded);
  const filters = useAppSelector(selectFilters);
  const orientations = useAppSelector(selectRecordOrientations);
  const currentPage = useAppSelector((s) => s.pagination.currentPage);
  const pageSize = useAppSelector((s) => s.pagination.pageSize);
  const columnWidths = useAppSelector((s) => s.ui.columnWidths);
  const expandedRows = useAppSelector((s) => s.ui.expandedRows);

  const [sortField, setSortField] = useState<string>("docketNumber");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc" | null>("asc");

  useEffect(() => {
    if (!loaded && !loading) {
      dispatch(fetchRecords());
    }
  }, []);

  const filteredRecords = useMemo(
    () => allRecords.filter((r) => matchesFilters(r, filters, orientations)),
    [allRecords, filters, orientations]
  );

  const sortedRecords = useMemo(
    () => sortRecords(filteredRecords, { field: sortField, direction: sortDirection }, orientations),
    [filteredRecords, sortField, sortDirection, orientations]
  );

  const totalRecords = sortedRecords.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const pageRecords = sortedRecords.slice(startIndex, startIndex + pageSize);

  const handleSort = (field: string) => {
    setSortDirection((prev) => {
      if (sortField !== field) return "asc";
      if (prev === "asc") return "desc";
      if (prev === "desc") return null;
      return "asc";
    });
    setSortField(field);
  };

  return (
    <div className="flex flex-col flex-1 w-full max-w-full min-w-0">
      <DataTableToolbar />

      <div className="flex-1 overflow-x-auto overflow-y-auto max-h-[70vh] w-full min-w-0">
        <table className="w-full border-collapse text-left" style={{ tableLayout: "fixed", minWidth: TABLE_MIN_WIDTH }}>
          <colgroup>
            {COLUMNS.map((col, idx) => {
              const width = columnWidths[idx] ?? col.width;
              return <col key={idx} style={{ width: width ? `${width}px` : undefined }} />;
            })}
          </colgroup>

          <DataTableHeader
            sortField={sortField}
            sortDirection={sortDirection}
            onSort={handleSort}
            columnWidths={columnWidths}
          />

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={COLUMNS.length} className="text-center py-20">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm">Loading records...</span>
                  </div>
                </td>
              </tr>
            ) : pageRecords.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="text-center py-20">
                  <div className="flex flex-col items-center gap-2">
                    <SearchX className="w-8 h-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">No records found</p>
                  </div>
                </td>
              </tr>
            ) : (
              pageRecords.map((record) => (
                <DataTableRow
                  key={record.id}
                  record={record as unknown as DocketRecord & { childItems: ChildItem[] }}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <DataTablePagination
        currentPage={safePage}
        totalPages={totalPages}
        totalRecords={totalRecords}
      />
    </div>
  );
}
