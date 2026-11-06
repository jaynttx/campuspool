"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";

/** Restrict and block, tucked behind a "More" menu next to a student's name. */
export function StudentActions({ userId, name }: { userId: string; name: string }) {
  const { relations, actions } = useStore();
  const blocked = relations.blocked.some((p) => p.id === userId);
  const restricted = relations.restricted.some((p) => p.id === userId);
  const [confirmBlock, setConfirmBlock] = useState(false);

  return (
    <details className="relative ml-auto">
      <summary className="btn btn-ghost btn-sm cursor-pointer list-none" aria-label={`More options for ${name}`}>
        More
      </summary>
      <div className="card absolute right-0 z-10 mt-2 w-72 space-y-4 p-4 text-sm">
        <div>
          <p className="font-semibold">{restricted ? "Restricted" : "Restrict"}</p>
          <p className="mt-1 text-mist">Their requests and messages still reach you, but quietly: no notifications and no unread badge. They are not told.</p>
          <button type="button" className="btn btn-ghost btn-sm mt-2" disabled={blocked} onClick={() => void actions.restrictStudent(userId, !restricted)}>
            {restricted ? "Remove restriction" : `Restrict ${name.split(" ")[0]}`}
          </button>
        </div>
        <div className="border-t border-line pt-4">
          <p className="font-semibold">{blocked ? "Blocked" : "Block"}</p>
          <p className="mt-1 text-mist">Neither of you can message the other or ask to join each other&apos;s rides and activities, and open posts are hidden from each other.</p>
          {blocked ? (
            <button type="button" className="btn btn-ghost btn-sm mt-2" onClick={() => void actions.blockStudent(userId, false)}>
              Unblock
            </button>
          ) : !confirmBlock ? (
            <button type="button" className="btn btn-bad btn-sm mt-2" onClick={() => setConfirmBlock(true)}>
              Block {name.split(" ")[0]}
            </button>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn btn-bad btn-sm"
                onClick={() => {
                  setConfirmBlock(false);
                  void actions.blockStudent(userId, true);
                }}
              >
                Yes, block
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmBlock(false)}>
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </details>
  );
}
