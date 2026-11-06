"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { LockIcon } from "@/components/Icons";
import { PageHeader } from "@/components/PageHeader";
import { Pill } from "@/components/StatusPill";
import { STICKERS } from "@/components/chat/Stickers";
import { ordinal } from "@/components/StudentLabel";
import { Empty, Ready } from "@/components/Ready";
import { api, absoluteUrl, errorMessage } from "@/lib/api";
import { decryptPayload } from "@/lib/e2ee";
import { timeAgo } from "@/lib/format";
import { useSecureChat } from "@/lib/secure-chat";
import { useStore } from "@/lib/store";

type ChatRow = {
  id: string;
  other: { id: string; name: string; avatarUrl: string | null; year: number | null; publicKey: string | null };
  last: { text: string; e2ee: boolean; hasImage: boolean; at: number; mine: boolean; envelope: string | null; senderId: string } | null;
  unread: number;
  restricted: boolean;
};

function Chats() {
  const { lastEvent, typing } = useStore();
  const secure = useSecureChat();
  const [chats, setChats] = useState<ChatRow[] | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await api<{ chats: ChatRow[] }>("/chats");
      setChats(r.chats);
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, lastEvent]);

  // Previews are opened here, in the browser. The server only ever sees the sealed envelope.
  useEffect(() => {
    if (!chats || secure.status !== "ready" || secure.myUserId === null) return;
    let cancelled = false;
    (async () => {
      const out: Record<string, string> = {};
      for (const c of chats) {
        const l = c.last;
        if (!l || !l.e2ee || !l.envelope) continue;
        try {
          const key = await secure.previewKey(c.id, c.other.publicKey);
          if (!key) continue;
          const p = await decryptPayload(key, l.envelope, secure.context(c.id, Number(l.senderId)));
          out[c.id] =
            p.k === "text"
              ? p.t
              : p.k === "img"
                ? p.mime === "image/gif"
                  ? "GIF"
                  : "Photo"
                : p.k === "sticker"
                  ? `Sticker: ${STICKERS[p.id]?.caption ?? "sticker"}`
                  : p.k === "gif"
                    ? "GIF"
                    : p.e
                      ? `Reacted ${p.e}`
                      : "Removed a reaction";
        } catch {
          /* leave the generic label */
        }
      }
      if (!cancelled) setPreviews(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [chats, secure]);

  const label = (c: ChatRow) => {
    const l = c.last;
    if (!l) return "No messages yet";
    const body = l.e2ee ? (previews[c.id] ?? (l.hasImage ? "Encrypted photo" : "Encrypted message")) : l.text;
    return `${l.mine ? "You: " : ""}${body}`;
  };

  return (
    <div>
      <PageHeader eyebrow="Messages" title="Chats" intro="One-to-one conversations with students you ride or take part in activities with. Only the two of you can read them." />
      {secure.status === "needs-device" && (
        <Link href={chats?.[0] ? `/chats/${chats[0].id}` : "/settings"} className="card mb-4 flex items-center gap-3 !border-warn-line !bg-warn-bg p-4 text-sm">
          <LockIcon className="h-5 w-5 shrink-0 text-signal" aria-hidden="true" />
          <span>
            <span className="block font-semibold">This device cannot open your chats yet</span>
            <span className="text-mist">Open a conversation to approve it from a device you already use.</span>
          </span>
        </Link>
      )}
      {error && (
        <p role="alert" className="mb-4 rounded-xl border border-alert/40 bg-bad-bg px-4 py-3 text-sm text-alert">
          {error}
        </p>
      )}
      {chats === null ? (
        <div className="space-y-3" aria-busy="true">
          <div className="skeleton h-20" />
          <div className="skeleton h-20" />
        </div>
      ) : chats.length === 0 ? (
        <Empty>No conversations yet. Open a ride or activity you are part of and tap Message to start one.</Empty>
      ) : (
        <ul className="card divide-y divide-line overflow-hidden">
          {chats.map((c) => {
            const isTyping = (typing[c.id] ?? 0) > Date.now() - 5000;
            return (
              <li key={c.id}>
                <Link href={`/chats/${c.id}`} className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-sage/60">
                  <span className="relative">
                    <Avatar name={c.other.name} src={absoluteUrl(c.other.avatarUrl)} size={48} />
                    {c.unread > 0 && <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full bg-coral ring-2 ring-paper" aria-hidden="true" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2 truncate font-medium">
                        {c.other.name}
                        {c.other.year ? <span className="text-xs font-normal text-mist">{ordinal(c.other.year)} year</span> : null} {c.restricted && <Pill tone="mute">Restricted</Pill>}
                      </span>
                      {c.last && <span className={`shrink-0 text-xs ${c.unread > 0 ? "font-semibold text-coral" : "text-mist"}`}>{timeAgo(c.last.at)}</span>}
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-3">
                      <span className={`block truncate text-sm ${isTyping ? "font-medium text-forest" : c.unread > 0 ? "font-medium text-ink" : "text-mist"}`}>{isTyping ? "typing..." : label(c)}</span>
                      {c.unread > 0 && <span className="tabular shrink-0 rounded-full bg-coral px-2 py-0.5 text-xs font-bold text-white dark:text-cream">{c.unread}</span>}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function ChatsPage() {
  return (
    <Ready>
      <Chats />
    </Ready>
  );
}
