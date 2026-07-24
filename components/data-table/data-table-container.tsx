"use client";

import React, { useMemo, useState, useEffect } from "react";
import { useAppSelector, useAppDispatch } from "@/store/hooks";
import {
  selectAllDenormalized, selectRecordsLoading, selectRecordsLoaded,
  fetchRecords,
} from "@/store/slices/dataSlice";
import { selectFilters } from "@/store/selectors/filterSelectors";
import type { FiltersState, DocketRecord, SortState, ChildItem } from "@/types";
import { DataTableHeader } from "./data-table-header";
import { DataTableRow } from "./data-table-row";
import { DataTablePagination } from "./data-table-pagination";
import { DataTableToolbar } from "./data-table-toolbar";
import { SearchX, Loader2 } from "lucide-react";

export const COLUMNS = [
  { key: "docketNumber", label: "Docket Number", filterType: "text" as const, sortable: true },
  { key: "utility", label: "Utility", filterType: null, sortable: true },
  { key: "partyName", label: "Party Name", filterType: "text" as const, sortable: true },
  { key: "projectRefNo", label: "Project Ref No", filterType: "text" as const, sortable: true },
  { key: "enquiryTenderNo", label: "Enquiry/Tender No", filterType: "text" as const, sortable: true },
  { key: "excelFiles", label: "Excel Files", filterType: null, sortable: false },
  { key: "docxStatus", label: "Generate GTP", filterType: null, sortable: true },
];

export const CHILD_COLUMNS = [
  { key: "itemName", label: "Item Name" },
  { key: "status", label: "Status" },
  { key: "assignedTo", label: "Assigned To" },
  { key: "dueDate", label: "Due Date" },
];

function matchesFilters(record: DocketRecord, filters: FiltersState): boolean {
  if (filters.docketNumber) {
    if (!record.docketNumber.toLowerCase().includes(filters.docketNumber.toLowerCase())) return false;
  }
  if (filters.utility.length > 0) {
    if (!filters.utility.includes(record.utility)) return false;
  }
  if (filters.partyName) {
    if (!record.partyName.toLowerCase().includes(filters.partyName.toLowerCase())) return false;
  }
  if (filters.projectRefNo) {
    if (!record.projectRefNo.toLowerCase().includes(filters.projectRefNo.toLowerCase())) return false;
  }
  if (filters.enquiryTenderNo) {
    if (!record.enquiryTenderNo.toLowerCase().includes(filters.enquiryTenderNo.toLowerCase())) return false;
  }
  if (filters.docxStatus.length > 0) {
    if (!filters.docxStatus.includes(record.docxStatus)) return false;
  }
  return true;
}

function getFieldValue(record: DocketRecord, key: string): string {
  const val = (record as unknown as Record<string, unknown>)[key];
  if (typeof val === "string") return val;
  if (Array.isArray(val)) return val.length > 0 ? `${val.length} files` : "No files";
  return String(val ?? "");
}

function sortRecords(records: DocketRecord[], sort: SortState): DocketRecord[] {
  if (!sort.direction || !sort.field) return records;
  const sorted = [...records].sort((a, b) => {
    const aVal = getFieldValue(a, sort.field);
    const bVal = getFieldValue(b, sort.field);
    const aNum = parseFloat(aVal);
    const bNum = parseFloat(bVal);
    let cmp: number;
    if (!isNaN(aNum) && !isNaN(bNum)) {
      cmp = aNum - bNum;
    } else {
      cmp = aVal.localeCompare(bVal);
    }
    return sort.direction === "asc" ? cmp : -cmp;
  });
  return sorted;
}

export function DataTableContainer() {
  const dispatch = useAppDispatch();
  const allRecords = useAppSelector(selectAllDenormalized);
  const loading = useAppSelector(selectRecordsLoading);
  const loaded = useAppSelector(selectRecordsLoaded);
  const filters = useAppSelector(selectFilters);
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
    () => allRecords.filter((r) => matchesFilters(r, filters)),
    [allRecords, filters]
  );

  const sortedRecords = useMemo(
    () => sortRecords(filteredRecords, { field: sortField, direction: sortDirection }),
    [filteredRecords, sortField, sortDirection]
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
        <table className="w-full border-collapse text-left" style={{ tableLayout: "fixed" }}>
          <colgroup>
            {COLUMNS.map((_, idx) => (
              <col key={idx} style={{ width: columnWidths[idx] ? `${columnWidths[idx]}px` : undefined }} />
            ))}
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
