"use client";

import React, { useState, useCallback, useRef } from "react";
import { ChevronRight, ChevronDown, Edit2, FileText, Upload, Plus, FileSpreadsheet } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { toggleRowExpand } from "@/store/slices/uiSlice";
import { updateRecordField, setRecordOrientation, selectRecordOrientation } from "@/store/slices/dataSlice";
import { COLUMNS } from "./data-table-container";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { DocketRecord, ChildItem } from "@/types";

interface RowProps {
  record: DocketRecord & { childItems: ChildItem[] };
}

const statusBadgeVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "outline",
  in_progress: "secondary",
  completed: "default",
  review: "destructive",
};

function EditableCell({ record, field }: { record: DocketRecord; field: string }) {
  const dispatch = useAppDispatch();
  const orientation = useAppSelector(selectRecordOrientation(record.id));
  const [editing, setEditing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const prevValue = String((record as unknown as Record<string, unknown>)[field] ?? "");

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      setEditing(false);
      const newValue = e.target.value;
      if (newValue !== prevValue) {
        dispatch(updateRecordField({ id: record.id, field, value: newValue }));
      }
    },
    [dispatch, record.id, field, prevValue]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
  };

  const handleGenerate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setGenerating(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId: record.id, orientation }),
      });
      if (!res.ok) throw new Error(await res.text());
      const version = res.headers.get("X-Generation-Version") || "1";
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${record.docketNumber}_v${version}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      dispatch(updateRecordField({ id: record.id, field: "generationVersion", value: Number(version) }));
      toast.success(`GTP document v${version} generated`);
    } catch (err) {
      toast.error("Generation failed", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setGenerating(false);
    }
  };

  if (editing) {
    return (
      <input
        defaultValue={prevValue}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        autoFocus
        className="w-full bg-transparent border-none text-xs outline-none focus:bg-accent focus:ring-1 focus:ring-blue-500 rounded p-1"
      />
    );
  }

  if (field === "docxStatus") {
    const ver = record.generationVersion;
    return (
      <div className="flex items-center gap-1.5">
        <button
          onClick={handleGenerate}
          disabled={generating || record.excelFiles.length === 0}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-lg border transition-all duration-200 bg-[#00875a] hover:bg-[#006644] text-white border-transparent shadow-xs cursor-pointer disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed disabled:border-border"
        >
          {generating ? "Generating..." : "Generate"}
        </button>
        {ver > 0 && (
          <span className="text-[10px] text-muted-foreground font-medium">v{ver}</span>
        )}
      </div>
    );
  }

  if (field === "excelFiles") {
    const files = record.excelFiles;
    if (files.length === 0) {
      return (
        <button
          onClick={(e) => { e.stopPropagation(); }}
          className="inline-flex items-center gap-1.5 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold text-xs py-1.5 px-3 rounded-[6px] shadow-xs transition-colors cursor-pointer"
        >
          <Upload className="w-3.5 h-3.5" />
          Upload
        </button>
      );
    }
    return (
      <div className="inline-flex items-center gap-1.5 border border-blue-200 bg-blue-50/50 pl-2 pr-2.5 py-0.5 rounded-full text-[10px] text-blue-900 font-medium">
        <FileSpreadsheet className="w-3 h-3" />
        <span>{files.length} {files.length === 1 ? "file" : "files"}</span>
      </div>
    );
  }

  return (
    <span
      className="group flex items-center gap-1 cursor-pointer hover:bg-muted/80 rounded p-1 -m-1 transition-colors"
      onDoubleClick={() => setEditing(true)}
    >
      <span className="flex-1 text-xs">{prevValue}</span>
      <Edit2
        className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      />
    </span>
  );
}

function ReadonlyCell({ record, field }: { record: DocketRecord; field: string }) {
  const dispatch = useAppDispatch();
  const orientation = useAppSelector(selectRecordOrientation(record.id));
  const [generating, setGenerating] = useState(false);
  const value = String((record as unknown as Record<string, unknown>)[field] ?? "");

  const handleGenerate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setGenerating(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId: record.id, orientation }),
      });
      if (!res.ok) throw new Error(await res.text());
      const version = res.headers.get("X-Generation-Version") || "1";
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${record.docketNumber}_v${version}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      dispatch(updateRecordField({ id: record.id, field: "generationVersion", value: Number(version) }));
      toast.success(`GTP document v${version} generated`);
    } catch (err) {
      toast.error("Generation failed", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setGenerating(false);
    }
  };

  if (field === "docxStatus") {
    const ver = record.generationVersion;
    return (
      <div className="flex items-center gap-1.5">
        <button
          onClick={handleGenerate}
          disabled={generating || record.excelFiles.length === 0}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-lg border transition-all duration-200 bg-[#00875a] hover:bg-[#006644] text-white border-transparent shadow-xs cursor-pointer disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed disabled:border-border"
        >
          {generating ? "Generating..." : "Generate"}
        </button>
        {ver > 0 && (
          <span className="text-[10px] text-muted-foreground font-medium">v{ver}</span>
        )}
      </div>
    );
  }

  if (field === "excelFiles") {
    const dispatch = useAppDispatch();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const files = record.excelFiles;

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = e.target.files;
      if (!selectedFiles?.length) return;

      const formData = new FormData();
      formData.append("recordId", record.id);
      for (const f of selectedFiles) formData.append("files", f);

      const toastId = toast.loading(`Uploading ${selectedFiles.length} file(s)...`);
      try {
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        if (!res.ok) {
          const err = await res.text();
          throw new Error(err);
        }
        const data = await res.json();
        const newFiles = data.attachments.map((a: { name: string; url: string }) => ({ name: a.name, url: a.url }));
        dispatch(updateRecordField({ id: record.id, field: "excelFiles", value: [...files, ...newFiles] }));
        toast.success(`Uploaded ${selectedFiles.length} file(s)`, { id: toastId });
      } catch (err) {
        toast.error("Upload failed", { id: toastId, description: err instanceof Error ? err.message : undefined });
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    };

    if (files.length === 0) {
      return (
        <>
          <input ref={fileInputRef} type="file" multiple accept=".xlsx,.xls" onChange={handleUpload} className="hidden" />
          <button
            onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
            className="inline-flex items-center gap-1.5 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold text-xs py-1.5 px-3 rounded-[6px] shadow-xs transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            Upload
          </button>
        </>
      );
    }

    return (
      <div className="flex flex-col gap-1 max-w-[180px]">
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 border border-blue-200 bg-blue-50/50 px-2 py-0.5 rounded-full text-[10px] text-blue-900 font-medium">
            <FileSpreadsheet className="w-3 h-3" />
            <span>{files.length} {files.length === 1 ? "file" : "files"}</span>
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
            className="inline-flex items-center gap-1 text-xs text-[#0f62fe] hover:text-[#1d4ed8] font-semibold cursor-pointer px-1.5 py-0.5 rounded hover:bg-blue-50 transition-colors"
          >
            <Plus className="w-3 h-3" />
            Add
          </button>
        </div>
        <input ref={fileInputRef} type="file" multiple accept=".xlsx,.xls" onChange={handleUpload} className="hidden" />
        {files.slice(0, 3).map((f, i) => (
          <a key={i} href={f.url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-[#0f62fe] hover:underline truncate"
            onClick={(e) => e.stopPropagation()}
          >
            <FileText className="h-3 w-3 shrink-0" />
            <span className="truncate">{f.name}</span>
          </a>
        ))}
        {files.length > 3 && (
          <span className="text-[10px] text-muted-foreground">+{files.length - 3} more</span>
        )}
      </div>
    );
  }

  return <span className="text-xs">{value}</span>;
}

function OrientationCell({ record }: { record: DocketRecord }) {
  const dispatch = useAppDispatch();
  const orientation = useAppSelector(selectRecordOrientation(record.id));

  return (
    <div onClick={(e) => e.stopPropagation()} className="flex items-center">
      <Select
        value={orientation}
        onValueChange={(value) =>
          dispatch(
            setRecordOrientation({ id: record.id, orientation: value as "portrait" | "landscape" })
          )
        }
      >
        <SelectTrigger size="sm" aria-label="Select page orientation" className="text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="portrait">Portrait</SelectItem>
          <SelectItem value="landscape">Landscape</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function ChildSubRow({ child, colCount }: { child: ChildItem; colCount: number }) {
  return (
    <tr className="bg-muted/10 hover:bg-muted/20">
      <td className="py-1.5 px-3 border-b border-border" />
      <td className="py-1.5 px-3 border-b border-border text-xs text-muted-foreground" colSpan={colCount - 1}>
        <div className="flex items-center gap-3">
          <span className="font-medium text-foreground">{child.itemName}</span>
          <Badge variant={statusBadgeVariant[child.status] || "outline"} className="text-[9px] px-1.5 py-0 h-4">
            {child.status.replace("_", " ")}
          </Badge>
          <span className="text-muted-foreground">{child.assignedTo}</span>
          <span className="text-muted-foreground">Due: {child.dueDate}</span>
        </div>
      </td>
    </tr>
  );
}

export function DataTableRow({ record }: RowProps) {
  const dispatch = useAppDispatch();
  const isExpanded = useAppSelector((s) => s.ui.expandedRows[record.id]);
  const hasChildren = record.childItems.length > 0;

  return (
    <>
      <tr className="hover:bg-muted/20 transition-colors border-b border-border">
        {COLUMNS.map((col, idx) => (
          <td key={idx} className="py-2 px-2 border-r border-border text-xs">
            {idx === 0 && hasChildren && (
              <button
                onClick={() => dispatch(toggleRowExpand(record.id))}
                className="inline-flex items-center mr-1 cursor-pointer text-muted-foreground hover:text-foreground"
              >
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            )}
            {idx === 0 && !hasChildren && <span className="inline-block w-[22px]" />}
            {col.key === "orientation"
              ? <OrientationCell record={record} />
              : (col.key === "loiNo" || col.key === "project")
                ? <EditableCell record={record} field={col.key} />
                : <ReadonlyCell record={record} field={col.key} />
            }
          </td>
        ))}
      </tr>
      {isExpanded && record.childItems.map((child) => (
        <ChildSubRow key={child.id} child={child} colCount={COLUMNS.length} />
      ))}
    </>
  );
}
