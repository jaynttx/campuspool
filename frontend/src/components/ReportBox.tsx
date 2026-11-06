"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { FlagIcon } from "./Icons";

export function ReportBox({ kind, targetId }: { kind: "ride" | "activity"; targetId: string }) {
  const { actions } = useStore();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  if (!open) {
    return (
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        <FlagIcon className="h-4 w-4" /> Report this {kind}
      </button>
    );
  }
  return (
    <div className="card p-4">
      <label>
        <span className="label">What went wrong? (misconduct, fraud, spam)</span>
        <textarea className="field" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="btn btn-bad btn-sm"
          onClick={async () => {
            const res = await actions.fileReport(kind, targetId, reason);
            if (res.ok) {
              setReason("");
              setOpen(false);
            }
          }}
        >
          Submit report
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
