"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { useAppDispatch } from "@/store/hooks";
import { setRecordReview } from "@/store/slices/dataSlice";
import SendMailDialog from "@/components/dialogs/send-mail-dialog";
import type { DocketRecord } from "@/types";

export const STAGE_LABEL = { review: "In review", approved: "Approved", client: "Sent to client" } as const;
const STAGE_STYLE = {
  review: "border-amber-200 bg-amber-50 text-amber-800",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-800",
  client: "border-blue-200 bg-blue-50 text-blue-900",
} as const;

const primaryButton =
  "text-xs font-semibold px-2 py-1 rounded-lg bg-[#00875a] hover:bg-[#006644] text-white cursor-pointer disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed";
const linkButton =
  "text-xs font-semibold text-[#0f62fe] hover:text-[#1d4ed8] px-1.5 py-0.5 rounded hover:bg-blue-50 cursor-pointer disabled:text-muted-foreground disabled:cursor-not-allowed disabled:hover:bg-transparent";

/** Review flow of one docket: mail the PDF for review -> approve -> mail the same PDF to the client. */
export function ReviewCell({ record }: { record: DocketRecord }) {
  const dispatch = useAppDispatch();
  const [dialog, setDialog] = useState<"review" | "client" | null>(null);
  const [approving, setApproving] = useState(false);
  const step = record.review;
  const noFiles = record.excelFiles.length === 0;

  const approve = async () => {
    if (!step || !window.confirm(`Mark GTP v${step.version} of ${record.docketNumber} as approved for the client?`)) return;
    setApproving(true);
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId: record.id, action: "approve" }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.review) throw new Error(data?.error || `Request failed (${res.status})`);
      dispatch(setRecordReview({ id: record.id, review: data.review }));
      toast.success(`GTP v${data.review.version} approved`);
    } catch (err) {
      toast.error("Could not approve", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setApproving(false);
    }
  };

  const sendForReview = (label: string, className: string) => (
    <button onClick={() => setDialog("review")} disabled={noFiles} className={className}
      title={noFiles ? "Upload the Excel files first" : undefined}>
      {label}
    </button>
  );

  return (
    <div className="flex flex-col items-start gap-1" onClick={(e) => e.stopPropagation()}>
      {step && (
        <span
          className={`inline-flex items-center border px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${STAGE_STYLE[step.stage]}`}
          title={`${step.sentTo ? `${step.sentTo} · ` : ""}${new Date(step.createdAt).toLocaleString()}`}
        >
          {STAGE_LABEL[step.stage]} · v{step.version}
        </span>
      )}

      <div className="flex items-center gap-1">
        {step?.stage === "review" ? (
          <>
            <button onClick={approve} disabled={approving} className={primaryButton}>
              {approving ? "Approving..." : "Approve"}
            </button>
            {sendForReview("Resend", linkButton)}
          </>
        ) : step?.stage === "approved" ? (
          <>
            <button onClick={() => setDialog("client")} className={primaryButton}>Send to client</button>
            {sendForReview("Revise", linkButton)}
          </>
        ) : (
          sendForReview(step ? "New review" : "Send for review", step ? linkButton : primaryButton)
        )}
      </div>

      {dialog && <SendMailDialog kind={dialog} record={record} onClose={() => setDialog(null)} />}
    </div>
  );
}
