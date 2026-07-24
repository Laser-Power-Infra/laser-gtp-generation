"use client";

import React from "react";
import { Download } from "lucide-react";
import { DocketRecord } from "../../app/mock-data";
import UploadCell from "./upload-cell";

interface DocumentTableProps {
  records: DocketRecord[];
  isLayoutBugMatched: boolean;
  selectedIds: string[];
  onToggleSelectRow: (id: string) => void;
  onUploadClick: (record: DocketRecord) => void;
  onGenerateDocx: (id: string) => void;
  onDownloadDocx: (record: DocketRecord) => void;
}

export default function DocumentTable({
  records,
  isLayoutBugMatched,
  selectedIds,
  onToggleSelectRow,
  onUploadClick,
  onGenerateDocx,
  onDownloadDocx,
}: DocumentTableProps) {
  return (
    <div className="w-full bg-white flex-1 flex flex-col min-h-0">
      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto">
        <table className="w-full min-w-[1000px] border-collapse text-left border-t border-b border-gray-200">
          {/* Table Headers */}
          <thead>
            <tr className="bg-[#f4f7fc] border-b border-gray-200">
              <th className="px-6 py-4 text-xs font-bold text-gray-500 tracking-normal w-[15%] border-r border-gray-200">
                Docket Number
              </th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 tracking-normal w-[15%] border-r border-gray-200">
                Utility
              </th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 tracking-normal w-[18%] border-r border-gray-200">
                Party Name
              </th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 tracking-normal w-[12%] border-r border-gray-200">
                Project Ref No
              </th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 tracking-normal w-[12%] border-r border-gray-200">
                Enquiry/Tender No
              </th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 tracking-normal w-[13%] border-r border-gray-200">
                Excel Files
              </th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 tracking-normal w-[15%] border-r border-gray-200">
                Generated Files
              </th>
            </tr>
          </thead>

          {/* Table Body */}
          <tbody>
            {records.map((record) => {
              const isSelected = selectedIds.includes(record.id);
              
              // Determine if we apply the column shift for this row.
              // Column shift is applied in the screenshot for row 3 (id "3") and row 4 (id "4").
              const isShifted = isLayoutBugMatched && (record.id === "3" || record.id === "4");

              if (isShifted) {
                // Shifted Layout (matches screenshot layout bug exactly)
                return (
                  <tr
                    key={record.id}
                    onClick={() => onToggleSelectRow(record.id)}
                    className={`hover:bg-gray-50/80 transition-colors cursor-pointer ${
                      isSelected ? "bg-blue-50/20" : ""
                    }`}
                  >
                    {/* Column 1: Docket Number (empty) */}
                    <td className="px-6 py-4 text-sm font-semibold text-gray-900 border-r border-gray-200 border-b border-gray-200"></td>

                    {/* Column 2: Utility (renders Docket Number) */}
                    <td className="px-6 py-4 text-sm font-bold text-gray-900 border-r border-gray-200 border-b border-gray-200">
                      {record.docketNumber}
                    </td>

                    {/* Column 3: Party Name (renders Utility) */}
                    <td className="px-6 py-4 text-sm text-gray-600 border-r border-gray-200 border-b border-gray-200">
                      {record.utility}
                    </td>

                    {/* Column 4: Project Ref No (renders Party Name) */}
                    <td className="px-6 py-4 text-sm text-gray-600 border-r border-gray-200 border-b border-gray-200">
                      {record.partyName}
                    </td>

                    {/* Column 5: Enquiry/Tender No (renders Project Ref No) */}
                    <td className="px-6 py-4 text-sm text-gray-600 border-r border-gray-200 border-b border-gray-200">
                      {record.projectRefNo}
                    </td>

                    {/* Column 6: Excel Files (renders Enquiry/Tender No) */}
                    <td className="px-6 py-4 text-sm text-gray-600 border-r border-gray-200 border-b border-gray-200">
                      {record.enquiryTenderNo}
                    </td>

                    {/* Column 7: DOCX (renders Excel Files component) */}
                    <td className="px-6 py-4 border-r border-gray-200 border-b border-gray-200">
                      <div onClick={(e) => e.stopPropagation()}>
                        <UploadCell
                          files={record.excelFiles}
                          rowId={record.id}
                          onUploadClick={() => onUploadClick(record)}
                          onViewClick={() => onUploadClick(record)}
                        />
                      </div>
                    </td>

                    {/* Column 8: Actions (renders Generate DOCX action button) */}
                    <td className="px-6 py-4 text-right border-b border-gray-200">
                      <div onClick={(e) => e.stopPropagation()} className="flex justify-end">
                        <button
                          onClick={() => onGenerateDocx(record.id)}
                          disabled={record.excelFiles.length === 0}
                          className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all duration-200 ${
                            record.excelFiles.length > 0
                              ? "bg-[#00875a] hover:bg-[#006644] text-white border-transparent shadow-xs cursor-pointer"
                              : "bg-[#f1f5f9] text-gray-400 border-gray-200 cursor-not-allowed"
                          }`}
                        >
                          Generate DOCX
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }

              // Normal Layout (corrected)
              return (
                <tr
                  key={record.id}
                  onClick={() => onToggleSelectRow(record.id)}
                  className={`hover:bg-gray-50/80 transition-colors cursor-pointer ${
                    isSelected ? "bg-blue-50/20" : ""
                  }`}
                >
                  {/* Column 1: Docket Number */}
                  <td className="px-6 py-4 text-sm font-bold text-gray-900 border-r border-gray-200 border-b border-gray-200">
                    {record.docketNumber}
                  </td>

                  {/* Column 2: Utility */}
                  <td className="px-6 py-4 text-sm text-gray-600 border-r border-gray-200 border-b border-gray-200">
                    {record.utility}
                  </td>

                  {/* Column 3: Party Name */}
                  <td className="px-6 py-4 text-sm text-gray-600 border-r border-gray-200 border-b border-gray-200">
                    {record.partyName}
                  </td>

                  {/* Column 4: Project Ref No */}
                  <td className="px-6 py-4 text-sm text-gray-600 border-r border-gray-200 border-b border-gray-200">
                    {record.projectRefNo}
                  </td>

                  {/* Column 5: Enquiry/Tender No */}
                  <td className="px-6 py-4 text-sm text-gray-600 border-r border-gray-200 border-b border-gray-200">
                    {record.enquiryTenderNo}
                  </td>

                  {/* Column 6: Excel Files */}
                  <td className="px-6 py-4 border-r border-gray-200 border-b border-gray-200">
                    <div onClick={(e) => e.stopPropagation()}>
                      <UploadCell
                        files={record.excelFiles}
                        rowId={record.id}
                        onUploadClick={() => onUploadClick(record)}
                        onViewClick={() => onUploadClick(record)}
                      />
                    </div>
                  </td>

                  {/* Column 7: DOCX status */}
                  <td className="px-6 py-4 border-r border-gray-200 border-b border-gray-200">
                    <div onClick={(e) => e.stopPropagation()}>
                      {record.docxStatus === "download" && (
                        <div className="flex flex-col gap-1 items-start">
                          <button
                            onClick={() => onDownloadDocx(record)}
                            className="inline-flex items-center gap-1.5 text-[#2563eb] hover:text-[#1d4ed8] font-bold text-sm cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5 stroke-[2.5]" />
                            <span>Download DOCX</span>
                          </button>
                          <span className="text-[10px] text-gray-400 font-semibold italic">
                            {record.docxGeneratedAt}
                          </span>
                        </div>
                      )}

                      {record.docxStatus === "generating" && (
                        <div className="flex flex-col gap-1 w-full max-w-[120px]">
                          <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                              style={{ width: `${record.docxProgress || 0}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-gray-400 font-medium">
                            Generating...
                          </span>
                        </div>
                      )}

                      {record.docxStatus === "not_generated" && !isLayoutBugMatched && (
                        <button
                          onClick={() => onGenerateDocx(record.id)}
                          disabled={record.excelFiles.length === 0}
                          className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all duration-200 ${
                            record.excelFiles.length > 0
                              ? "bg-[#00875a] hover:bg-[#006644] text-white border-transparent shadow-xs cursor-pointer"
                              : "bg-[#f1f5f9] text-gray-400 border-gray-200 cursor-not-allowed"
                          }`}
                        >
                          Generate DOCX
                        </button>
                      )}
                    </div>
                  </td>

                  {/* Column 8: Action column (only renders Generate DOCX button when shifted, or empty otherwise) */}
                  <td className="px-6 py-4 text-right border-b border-gray-200">
                    {/* Empty for normal alignment (Generate button is in column 7) */}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
