"use client";

import React, { useRef } from "react";
import { Download, FileUp, RotateCw, XCircle } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { resetFilters } from "@/store/slices/filtersSlice";
import { syncSmartsheet, selectRecordsLoaded, selectRecordsSyncing, selectAllRecords } from "@/store/slices/dataSlice";
import { selectHasActiveFilters } from "@/store/selectors/filterSelectors";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";

export function DataTableToolbar() {
  const dispatch = useAppDispatch();
  const hasActiveFilters = useAppSelector(selectHasActiveFilters);
  const loaded = useAppSelector(selectRecordsLoaded);
  const allRecords = useAppSelector(selectAllRecords);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const syncing = useAppSelector(selectRecordsSyncing);

  const handleExport = () => {
    try {
      const data = allRecords.map((rec) => ({
        "Docket Number": rec.docketNumber,
        Utility: rec.utility,
        "Party Name": rec.partyName,
        "Project Ref No": rec.projectRefNo,
        "Enquiry/Tender No": rec.enquiryTenderNo,
        "Excel Files": rec.excelFiles.join(", "),
        "DOCX Status": rec.docxStatus,
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Records");
      XLSX.writeFile(wb, "docket_records_export.xlsx");
      toast.success("Exported to Excel");
    } catch {
      toast.error("Export failed");
    }
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws);
        toast.success(`Imported ${rows.length} rows from Excel`);
      } catch {
        toast.error("Import failed");
      }
    };
    reader.readAsArrayBuffer(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-background/80">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="xs"
          onClick={() => dispatch(syncSmartsheet())}
          disabled={syncing}
        >
          <RotateCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
          Sync
        </Button>

        <Button variant="outline" size="xs" onClick={handleExport} disabled={!loaded}>
          <Download className="w-3.5 h-3.5" />
          Export
        </Button>

        <Button variant="outline" size="xs" onClick={() => fileInputRef.current?.click()} disabled={!loaded} className="text-emerald-600 border-emerald-200 hover:bg-emerald-50">
          <FileUp className="w-3.5 h-3.5" />
          Import
        </Button>
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleImport} className="hidden" />

        {hasActiveFilters && (
          <Button variant="ghost" size="xs" onClick={() => dispatch(resetFilters())}>
            <XCircle className="w-3.5 h-3.5" />
            Reset Filters
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {loaded ? `${allRecords.length} records` : "No records"}
        </span>
      </div>
    </div>
  );
}
