"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { MessageIcon } from "./Icons";

/** Opens a one-to-one chat with a student. The server only allows it between people connected by a ride or activity request. */
export function MessageButton({ userId, label = "Message", small = true }: { userId: string; label?: string; small?: boolean }) {
  const router = useRouter();
  const { actions } = useStore();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={`btn btn-ghost ${small ? "btn-sm" : ""}`}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await actions.startChat(userId);
        setBusy(false);
        if (res.ok && res.id) router.push(`/chats/${res.id}`);
      }}
    >
      <MessageIcon className="h-4 w-4" aria-hidden="true" /> {label}
    </button>
  );
}
