"use client";

import React, { useState } from "react";
import { X } from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { toast } from "sonner";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setRecordReview, selectRecordOrientation } from "@/store/slices/dataSlice";
import type { DocketRecord } from "@/types";

const REVIEWER_EMAIL = "puja.agarwal@laserpowerinfra.com";

interface SendMailDialogProps {
  /** "review": generate the PDF and mail it internally. "client": mail the approved PDF. */
  kind: "review" | "client";
  record: DocketRecord;
  onClose: () => void;
}

const inputClass =
  "w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white";

export default function SendMailDialog({ kind, record, onClose }: SendMailDialogProps) {
  const dispatch = useAppDispatch();
  const orientation = useAppSelector(selectRecordOrientation(record.id));
  const { user } = useUser();
  const sender = user?.fullName || "Laser Power & Infra Limited";
  const isReview = kind === "review";
  const approvedVersion = record.review?.version;

  const [to, setTo] = useState(isReview ? REVIEWER_EMAIL : "");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState(
    isReview
      ? `GTP for review – ${record.docketNumber}${record.utility ? ` – ${record.utility}` : ""}`
      : `Guaranteed Technical Particulars (GTP) – ${record.enquiryTenderNo || record.projectRefNo || record.docketNumber}`
  );
  const [message, setMessage] = useState(
    isReview
      ? `Dear Team,\n\nPlease find attached the GTP for docket ${record.docketNumber}` +
        `${record.utility ? ` (${[record.utility, record.partyName].filter(Boolean).join(" / ")})` : ""} for your review.\n\n` +
        `Kindly confirm, or share the changes required, so that it can be sent to the client.\n\nRegards,\n${sender}`
      : `Dear Sir/Madam,\n\nPlease find attached the Guaranteed Technical Particulars (GTP)` +
        `${record.project ? ` for ${record.project}` : ""}.\n\n` +
        `Kindly review and let us know if anything further is required.\n\nRegards,\n${sender}` +
        `${user?.fullName ? "\nLaser Power & Infra Limited" : ""}`
  );
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    setSending(true);
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId: record.id, action: kind, orientation, to, cc, subject, message }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.review) throw new Error(data?.error || `Request failed (${res.status})`);
      dispatch(setRecordReview({ id: record.id, review: data.review }));
      toast.success(
        isReview ? `GTP v${data.review.version} sent for review` : `GTP v${data.review.version} sent to client`,
        { description: data.review.sentTo }
      );
      onClose();
    } catch (err) {
      toast.error("Mail not sent", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-xs" onClick={sending ? undefined : onClose} />

      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 z-10 overflow-hidden flex flex-col border border-gray-100">
        <div className="px-6 py-4 border-b border-gray-150 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-900">
              {isReview ? "Send for review" : "Send to client"}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {isReview
                ? `A new ${orientation} PDF of ${record.docketNumber} is generated and attached.`
                : `The approved PDF (v${approvedVersion}) of ${record.docketNumber} is attached.`}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={sending}
            aria-label="Close"
            className="text-gray-400 hover:text-gray-600 rounded-lg p-1 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-3 max-h-[65vh] overflow-y-auto text-left">
          <label className="text-xs font-semibold text-gray-500">
            To
            <input
              type="text"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder={isReview ? "reviewer@laserpowerinfra.com" : "client@example.com"}
              className={`${inputClass} mt-1 font-normal text-gray-900`}
              autoFocus={!isReview}
            />
          </label>
          <label className="text-xs font-semibold text-gray-500">
            CC <span className="font-normal text-gray-400">(optional, comma separated)</span>
            <input
              type="text"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              className={`${inputClass} mt-1 font-normal text-gray-900`}
            />
          </label>
          <label className="text-xs font-semibold text-gray-500">
            Subject
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className={`${inputClass} mt-1 font-normal text-gray-900`}
            />
          </label>
          <label className="text-xs font-semibold text-gray-500">
            Message
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={9}
              className={`${inputClass} mt-1 font-normal text-gray-900 resize-y`}
            />
          </label>
        </div>

        <div className="px-6 py-4 border-t border-gray-150 bg-gray-50 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={sending}
            className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-semibold rounded-lg bg-white hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !to.trim() || !subject.trim() || !message.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? (isReview ? "Generating and sending..." : "Sending...") : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
