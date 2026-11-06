"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Avatar } from "@/components/Avatar";
import { EncryptedImage } from "@/components/EncryptedImage";
import { AttachIcon, BackIcon, CloseIcon, LockIcon, MoreIcon, ReactIcon, SeenIcon, SendIcon, SoundOffIcon, SoundOnIcon, StickerIcon } from "@/components/Icons";
import { Ready } from "@/components/Ready";
import { SecureChatGate } from "@/components/SecureChatGate";
import { ordinal } from "@/components/StudentLabel";
import { Sticker, STICKERS } from "@/components/chat/Stickers";
import { Tray, type TrayTab } from "@/components/chat/Tray";
import { api, absoluteUrl, errorMessage } from "@/lib/api";
import { decryptPayload, encryptBytes, encryptPayload, type Payload } from "@/lib/e2ee";
import { isAllowedGifUrl, type Gif } from "@/lib/giphy";
import { downscaleToJpeg } from "@/lib/image";
import { usePrefs } from "@/lib/prefs";
import { useSecureChat, type ConversationCrypto } from "@/lib/secure-chat";
import { playSound, unlockAudio, type SoundName } from "@/lib/sounds";
import { useStore } from "@/lib/store";

type Msg = { id: number; senderId: string; text: string; e2ee: boolean; envelope: string | null; imageUrl: string | null; at: number; read: boolean };
type Header = {
  id: string;
  other: { id: string; name: string; avatarUrl: string | null; year: number | null };
  blockedByMe: boolean;
  blockedMe: boolean;
  restrictedByMe: boolean;
};
type View =
  | { kind: "text"; text: string }
  | { kind: "legacy"; text: string; imageUrl: string | null }
  | { kind: "image"; url: string; iv: string; mime: string; context: Uint8Array<ArrayBuffer> }
  | { kind: "sticker"; id: string }
  | { kind: "gif"; url: string; w: number; h: number; title: string }
  | { kind: "react"; to: number; e: string }
  | { kind: "error" };

const QUICK_REACTIONS = ["❤️", "😂", "👍", "😮", "😢", "🙏"];
const MAX_GIF_BYTES = 5 * 1024 * 1024;
const RUN_GAP_MS = 3 * 60 * 1000;

function toView(p: Payload, m: Msg, context: Uint8Array<ArrayBuffer>): View {
  switch (p.k) {
    case "text":
      return { kind: "text", text: p.t };
    case "img":
      return { kind: "image", url: m.imageUrl ?? "", iv: p.iv, mime: p.mime === "image/gif" ? "image/gif" : "image/jpeg", context };
    case "sticker":
      return STICKERS[p.id] ? { kind: "sticker", id: p.id } : { kind: "error" };
    case "gif":
      return isAllowedGifUrl(p.url) ? { kind: "gif", url: p.url, w: p.w, h: p.h, title: p.title ?? "GIF" } : { kind: "error" };
    case "react":
      return { kind: "react", to: p.to, e: [...(p.e ?? "")].slice(0, 4).join("") };
    default:
      return { kind: "error" };
  }
}

/** One to three emoji and nothing else are shown large, like most messengers do. */
function isEmojiOnly(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 24 || !/\p{Extended_Pictographic}/u.test(t)) return false;
  if (!/^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|\u200d|\ufe0f|\s)+$/u.test(t)) return false;
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment(s: string): Iterable<unknown> } }).Segmenter;
  const count = Seg ? [...new Seg(undefined, { granularity: "grapheme" }).segment(t.replace(/\s/g, ""))].length : 1;
  return count <= 3;
}

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
function dayName(ms: number): string {
  const d = new Date(ms);
  const today = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(today) - start(d)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString([], { weekday: diff < 7 ? "long" : undefined, day: "numeric", month: "short" });
}

function previewOf(v: View | undefined): string {
  if (!v) return "";
  if (v.kind === "text" || v.kind === "legacy") return v.text || (v.kind === "legacy" && v.imageUrl ? "[photo]" : "");
  if (v.kind === "image") return v.mime === "image/gif" ? "[GIF]" : "[photo]";
  if (v.kind === "sticker") return `[sticker: ${STICKERS[v.id]?.caption ?? v.id}]`;
  if (v.kind === "gif") return `[GIF: ${v.title}]`;
  return "";
}

function Thread({ id }: { id: string }) {
  const { lastEvent, me, typing, sendTyping } = useStore();
  const secure = useSecureChat();
  const { sounds, setSounds } = usePrefs();
  const [header, setHeader] = useState<Header | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [views, setViews] = useState<Record<number, View>>({});
  const [conv, setConv] = useState<ConversationCrypto | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [panel, setPanel] = useState<"none" | "security" | "report" | "menu">("none");
  const [trayTab, setTrayTab] = useState<TrayTab | null>(null);
  const [reactingTo, setReactingTo] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [includeLines, setIncludeLines] = useState(false);
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const decrypted = useRef(new Map<number, View>());
  const keyRef = useRef<CryptoKey | null>(null);
  const seen = useRef<Set<number> | null>(null);
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const peerId = header?.other.id;

  const sound = useCallback((name: SoundName) => playSound(name, sounds), [sounds]);

  const load = useCallback(async () => {
    try {
      const r = await api<{ messages: Msg[] }>(`/chats/${id}/messages`);
      setMessages(r.messages);
      setError("");
      if (r.messages.some((m) => m.senderId !== "me" && !m.read)) void api(`/chats/${id}/read`, { method: "POST", body: {} });
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [id]);

  const loadHeader = useCallback(() => {
    api<Header>(`/chats/${id}`)
      .then(setHeader)
      .catch((e: unknown) => setError(errorMessage(e)));
  }, [id]);

  useEffect(() => {
    loadHeader();
  }, [loadHeader, lastEvent]);
  useEffect(() => {
    void load();
  }, [load, lastEvent]);
  useEffect(() => {
    const t = window.setInterval(() => void load(), 15000);
    return () => window.clearInterval(t);
  }, [load]);

  // "typing..." fades on its own.
  const typingAt = typing[id] ?? 0;
  useEffect(() => {
    if (!typingAt) return;
    setNow(Date.now());
    const t = window.setTimeout(() => setNow(Date.now()), 5000);
    return () => window.clearTimeout(t);
  }, [typingAt]);
  const peerTyping = typingAt > 0 && now - typingAt < 5000;

  // Prepare this conversation's key once the other student's public key is known.
  // Checked again whenever their key appears or changes (the server says so), and every few seconds while waiting.
  const keyEvent = lastEvent?.type === "e2ee-key" ? lastEvent.at : 0;
  useEffect(() => {
    if (!peerId || secure.status !== "ready") return;
    let cancelled = false;
    const check = () =>
      secure
        .conversation(id, peerId)
        .then((c) => {
          if (!cancelled) setConv(c);
          return c;
        })
        .catch((e: unknown) => {
          if (!cancelled) setError(errorMessage(e));
          return null;
        });
    let timer: number | undefined;
    void check().then((c) => {
      if (cancelled || (c && c.ready)) return;
      timer = window.setInterval(() => {
        void check().then((next) => {
          if (next?.ready) window.clearInterval(timer);
        });
      }, 5000);
    });
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [id, peerId, secure, keyEvent]);

  // Decrypt on this device. Each message is opened once and remembered.
  useEffect(() => {
    let cancelled = false;
    const key = conv?.ready ? conv.key : null;
    if (key !== keyRef.current) {
      keyRef.current = key;
      decrypted.current.clear();
    }
    (async () => {
      for (const m of messages) {
        if (decrypted.current.has(m.id)) continue;
        if (!m.e2ee) {
          decrypted.current.set(m.id, { kind: "legacy", text: m.text, imageUrl: m.imageUrl });
          continue;
        }
        if (!key || !m.envelope || secure.myUserId === null) continue;
        try {
          const sender = m.senderId === "me" ? secure.myUserId : Number(m.senderId);
          const context = secure.context(id, sender);
          decrypted.current.set(m.id, toView(await decryptPayload(key, m.envelope, context), m, context));
        } catch {
          decrypted.current.set(m.id, { kind: "error" });
        }
      }
      if (cancelled) return;
      setViews(Object.fromEntries(decrypted.current));
      // New arrivals from the other person: sound, and stickers play their animation.
      const ids = new Set(messages.map((m) => m.id));
      if (seen.current === null) {
        seen.current = ids;
        return;
      }
      const arrived = messages.filter((m) => !seen.current!.has(m.id));
      seen.current = ids;
      if (arrived.length > 0) {
        setFresh(new Set(arrived.map((m) => m.id)));
        const fromThem = arrived.filter((m) => m.senderId !== "me");
        if (fromThem.length > 0 && document.visibilityState === "visible") {
          const last = decrypted.current.get(fromThem[fromThem.length - 1].id);
          sound(last?.kind === "react" ? "react" : last?.kind === "sticker" || last?.kind === "gif" ? "sticker" : "receive");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [messages, conv, id, secure, sound]);

  // Stay at the bottom when something new arrives, unless the student scrolled up to read.
  const atBottom = useRef(true);
  useEffect(() => {
    const el = logRef.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, views, peerTyping, trayTab]);

  /* ---------- reactions and the visible list ---------- */

  const { visible, reactions } = useMemo(() => {
    const reactions = new Map<number, Map<string, string>>();
    const visible: Msg[] = [];
    for (const m of messages) {
      const v = views[m.id];
      if (v?.kind === "react") {
        const forMsg = reactions.get(v.to) ?? new Map<string, string>();
        if (v.e) forMsg.set(m.senderId, v.e);
        else forMsg.delete(m.senderId);
        reactions.set(v.to, forMsg);
      } else {
        visible.push(m);
      }
    }
    return { visible, reactions };
  }, [messages, views]);

  /* ---------- sending ---------- */

  const sendPayload = useCallback(
    async (payload: Payload, soundName: SoundName) => {
      if (!conv?.ready || secure.myUserId === null) return false;
      unlockAudio();
      try {
        const envelope = await encryptPayload(conv.key, payload, secure.context(id, secure.myUserId));
        await api(`/chats/${id}/messages`, { method: "POST", body: { envelope } });
        sound(soundName);
        atBottom.current = true;
        await load();
        return true;
      } catch (err) {
        setError(errorMessage(err));
        return false;
      }
    },
    [conv, secure, id, load, sound],
  );

  async function sendText(e?: FormEvent) {
    e?.preventDefault();
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    if (await sendPayload({ k: "text", t: body }, "send")) setText("");
    setBusy(false);
    inputRef.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void sendText();
    }
  }

  async function sendSticker(stickerId: string) {
    setTrayTab(null);
    await sendPayload({ k: "sticker", id: stickerId }, "sticker");
  }

  async function sendGif(g: Gif) {
    setTrayTab(null);
    await sendPayload({ k: "gif", url: g.url, w: g.w, h: g.h, title: g.title.slice(0, 80) }, "sticker");
  }

  async function react(to: number, emoji: string) {
    setReactingTo(null);
    const mine = reactions.get(to)?.get("me");
    await sendPayload({ k: "react", to, e: mine === emoji ? "" : emoji }, "react");
  }

  async function sendFile(file: File | undefined) {
    if (!file || !conv?.ready || secure.myUserId === null) return;
    setError("");
    if (!file.type.startsWith("image/")) return setError("Choose a photo or a GIF.");
    const isGif = file.type === "image/gif";
    if (isGif && file.size > MAX_GIF_BYTES) return setError("That GIF is over 5 MB. Choose a smaller one.");
    setUploading(true);
    try {
      const context = secure.context(id, secure.myUserId);
      // GIFs are sent as they are so they keep moving; photos are shrunk first.
      const plain = isGif ? new Uint8Array(await file.arrayBuffer()) : new Uint8Array(await (await downscaleToJpeg(file, 1600)).arrayBuffer());
      const sealed = await encryptBytes(conv.key, plain, context);
      const envelope = await encryptPayload(conv.key, { k: "img", mime: isGif ? "image/gif" : "image/jpeg", iv: sealed.iv }, context);
      await api(`/chats/${id}/images`, { method: "POST", raw: sealed.data, contentType: "application/octet-stream", headers: { "X-Envelope": envelope } });
      sound(isGif ? "sticker" : "send");
      atBottom.current = true;
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  /* ---------- moderation ---------- */

  async function toggle(kind: "block" | "restrict") {
    if (!header) return;
    setPanel("none");
    try {
      const on = kind === "block" ? !header.blockedByMe : !header.restrictedByMe;
      await api(`/chats/${id}/${kind}`, { method: "POST", body: { blocked: on } });
      loadHeader();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function sendReport(e: FormEvent) {
    e.preventDefault();
    let evidence: string | undefined;
    if (includeLines && header) {
      evidence =
        visible
          .slice(-10)
          .map((m) => {
            const said = previewOf(views[m.id]);
            return said ? `${m.senderId === "me" ? me.name : header.other.name}: ${said}` : "";
          })
          .filter(Boolean)
          .join("\n") || undefined;
    }
    try {
      await api(`/chats/${id}/report`, { method: "POST", body: { reason, evidence } });
      setPanel("none");
      setReason("");
      setNotice("Report sent. A moderator will review it.");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (!header && error) {
    return (
      <div className="card p-8 text-center">
        <p className="font-display text-2xl font-semibold">Conversation not found</p>
        <p className="mt-1 text-mist">{error}</p>
        <Link href="/chats" className="btn btn-primary mt-4">
          Back to chats
        </Link>
      </div>
    );
  }

  const locked = header?.blockedByMe || header?.blockedMe;
  const peerNotReady = conv !== null && !conv.ready;
  const canSend = !!conv?.ready && !locked;
  const firstName = header?.other.name.split(" ")[0] ?? "";

  return (
    <div className="card mx-auto flex h-[calc(100dvh-11.5rem)] max-w-2xl flex-col overflow-hidden !rounded-2xl md:h-[calc(100dvh-6rem)]">
      {/* header */}
      <div className="relative flex items-center gap-3 border-b border-line px-3 py-2.5">
        <Link href="/chats" className="btn btn-ghost btn-icon !border-transparent" aria-label="Back to chats">
          <BackIcon className="h-5 w-5" />
        </Link>
        {header ? <Avatar name={header.other.name} src={absoluteUrl(header.other.avatarUrl)} size={40} /> : <span className="skeleton h-10 w-10 !rounded-full" />}
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-lg font-semibold leading-tight">
            {header?.other.name ?? "Loading"}
            {header?.other.year ? <span className="ml-2 hidden font-sans text-xs font-normal text-mist sm:inline">{ordinal(header.other.year)} year</span> : null}
          </h1>
          {peerTyping ? (
            <p className="flex items-center gap-1.5 text-xs font-medium text-forest" role="status">
              <span className="typing-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              typing
            </p>
          ) : (
            <button type="button" className="flex max-w-full items-center gap-1 truncate whitespace-nowrap text-xs text-mist hover:text-ink" onClick={() => setPanel(panel === "security" ? "none" : "security")} aria-expanded={panel === "security"}>
              <LockIcon className="h-3 w-3" aria-hidden="true" /> End-to-end encrypted{conv?.ready && conv.verified ? ", verified" : ""}
            </button>
          )}
        </div>
        <button type="button" className="btn btn-ghost btn-icon !border-transparent" onClick={() => setSounds(!sounds)} aria-label={sounds ? "Turn chat sounds off" : "Turn chat sounds on"} aria-pressed={sounds} title={sounds ? "Sounds on" : "Sounds off"}>
          {sounds ? <SoundOnIcon className="h-5 w-5" /> : <SoundOffIcon className="h-5 w-5 text-mist" />}
        </button>
        {header && (
          <button type="button" className="btn btn-ghost btn-icon !border-transparent" onClick={() => setPanel(panel === "menu" ? "none" : "menu")} aria-expanded={panel === "menu"} aria-label="More options">
            <MoreIcon className="h-5 w-5" />
          </button>
        )}
        {panel === "menu" && header && (
          <div className="card absolute right-3 top-full z-20 mt-1 w-56 overflow-hidden p-1 text-sm" role="menu">
            <button type="button" role="menuitem" className="block w-full rounded-lg px-3 py-2 text-left hover:bg-sage" onClick={() => setPanel("security")}>
              Security code
            </button>
            <button type="button" role="menuitem" className="block w-full rounded-lg px-3 py-2 text-left hover:bg-sage disabled:opacity-50" disabled={header.blockedByMe} onClick={() => void toggle("restrict")}>
              {header.restrictedByMe ? "Remove restriction" : "Restrict (quiet, they are not told)"}
            </button>
            <button type="button" role="menuitem" className="block w-full rounded-lg px-3 py-2 text-left hover:bg-sage" onClick={() => void toggle("block")}>
              {header.blockedByMe ? "Unblock" : "Block"}
            </button>
            <button type="button" role="menuitem" className="block w-full rounded-lg px-3 py-2 text-left text-alert hover:bg-bad-bg" onClick={() => setPanel("report")}>
              Report {firstName}
            </button>
          </div>
        )}
      </div>

      {/* panels */}
      {panel === "security" && conv?.ready && (
        <div className="space-y-2 border-b border-line bg-sage/50 px-4 py-3 text-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="text-mist">Only you and {firstName} can read these messages. To be sure nobody is in the middle, compare this security code with them in person or on a call.</p>
            <button type="button" className="btn btn-ghost btn-icon btn-sm !border-transparent" onClick={() => setPanel("none")} aria-label="Close">
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
          <p className="tabular rounded-lg bg-paper px-3 py-2 text-center font-semibold tracking-wider">{conv.safety}</p>
          {!conv.verified && header && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                secure.markVerified(header.other.id, conv.safety);
                setConv({ ...conv, verified: true });
              }}
            >
              We matched, mark as verified
            </button>
          )}
        </div>
      )}
      {conv?.ready && conv.peerChanged && header && (
        <div role="alert" className="border-b border-warn-line bg-warn-bg px-4 py-3 text-sm">
          <p className="font-semibold text-signal">{header.other.name}&apos;s security code changed</p>
          <p className="mt-1 text-mist">They reset secure chat. Check the new code with them before trusting new messages. Older messages may no longer open.</p>
          <button
            type="button"
            className="btn btn-ghost btn-sm mt-2"
            onClick={() => {
              secure.acceptNewKey(header.other.id, conv.peerPublicKey);
              setConv({ ...conv, peerChanged: false });
            }}
          >
            I understand
          </button>
        </div>
      )}
      {panel === "report" && (
        <form onSubmit={sendReport} className="space-y-3 border-b border-line px-4 py-3">
          <label className="block">
            <span className="label">What happened?</span>
            <textarea className="field" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </label>
          <label className="flex items-start gap-2 text-sm text-mist">
            <input type="checkbox" className="mt-1" checked={includeLines} onChange={(e) => setIncludeLines(e.target.checked)} />
            <span>Share the last 10 messages with the moderators. They are opened on your device and sent only if you tick this.</span>
          </label>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-bad btn-sm" disabled={reason.trim().length < 3}>
              Send report
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPanel("none")}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {notice && <p className="border-b border-line px-4 py-2 text-sm text-verified">{notice}</p>}
      {header?.restrictedByMe && <p className="border-b border-line bg-sage/60 px-4 py-2 text-xs text-mist">You restricted this student. Their messages arrive without notifications.</p>}

      {/* messages */}
      <div
        ref={logRef}
        className="chat-ground min-h-0 flex-1 overflow-y-auto px-3 py-4"
        role="log"
        aria-live="polite"
        aria-label="Messages"
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        onClick={() => setReactingTo(null)}
      >
        {visible.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <Sticker id="wait" size={110} live />
            <p className="max-w-xs text-sm text-mist">No messages yet. Say hello, or send a sticker to break the ice.</p>
          </div>
        ) : (
          visible.map((m, i) => {
            const mine = m.senderId === "me";
            const v = views[m.id];
            const prev = visible[i - 1];
            const newDay = !prev || dayName(prev.at) !== dayName(m.at);
            const joinsPrev = !newDay && prev && prev.senderId === m.senderId && m.at - prev.at < RUN_GAP_MS;
            const bare = v?.kind === "sticker" || v?.kind === "gif" || (v?.kind === "text" && isEmojiOnly(v.text));
            const isNew = fresh.has(m.id);
            const r = reactions.get(m.id);
            const counts = new Map<string, { n: number; mine: boolean }>();
            r?.forEach((emoji, who) => {
              const c = counts.get(emoji) ?? { n: 0, mine: false };
              counts.set(emoji, { n: c.n + 1, mine: c.mine || who === "me" });
            });
            const meta = (
              <span className={`bubble-meta mt-0.5 flex items-center gap-1 ${mine ? "justify-end" : ""}`}>
                {clock(m.at)}
                {mine && <SeenIcon className={`h-3.5 w-3.5 ${m.read ? "opacity-100" : "opacity-50"}`} aria-label={m.read ? "Seen" : "Sent"} />}
              </span>
            );
            return (
              <Fragment key={m.id}>
                {newDay && (
                  <div className="my-3 flex justify-center">
                    <span className="day-chip">{dayName(m.at)}</span>
                  </div>
                )}
                <div className={`group relative flex items-end gap-1 ${mine ? "flex-row-reverse" : ""} ${joinsPrev ? "mt-0.5" : "mt-2.5"} ${r && r.size && !bare ? "mb-3" : ""}`}>
                  <div
                    className={`${bare ? "max-w-[80%]" : `bubble ${mine ? "bubble-mine" : "bubble-theirs"} ${joinsPrev ? (mine ? "bubble-run-mine" : "bubble-run-theirs") : ""}`} ${isNew ? "bubble-new" : ""}`}
                    onDoubleClick={() => canSend && v && v.kind !== "error" && void react(m.id, "❤️")}
                  >
                    {v?.kind === "text" && (isEmojiOnly(v.text) ? <p className="emoji-only">{v.text}</p> : <p className="whitespace-pre-wrap">{v.text}</p>)}
                    {v?.kind === "legacy" && (
                      <>
                        {v.imageUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={absoluteUrl(v.imageUrl) ?? ""} alt="Photo sent before secure chat" className="mb-1 max-h-64 rounded-xl object-cover" />
                        )}
                        {v.text && <p className="whitespace-pre-wrap">{v.text}</p>}
                        <p className="text-[11px] opacity-70">Sent before secure chat</p>
                      </>
                    )}
                    {v?.kind === "image" && conv?.ready && <EncryptedImage url={v.url} iv={v.iv} mime={v.mime} cryptoKey={conv.key} context={v.context} />}
                    {v?.kind === "sticker" && <Sticker id={v.id} size={132} live={isNew} />}
                    {v?.kind === "gif" && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={v.url}
                        alt={v.title}
                        width={v.w}
                        height={v.h}
                        referrerPolicy="no-referrer"
                        loading="lazy"
                        className="h-auto max-h-60 w-auto max-w-[240px] rounded-2xl border border-line"
                        style={{ aspectRatio: `${v.w} / ${v.h}` }}
                      />
                    )}
                    {(!v || v.kind === "error") && <p className="text-sm italic opacity-80">{v ? "This message could not be opened on this device." : "Opening..."}</p>}
                    {bare ? <span className="text-mist">{meta}</span> : meta}
                    {counts.size > 0 && (
                      <div className={bare ? `mt-1 flex gap-1 ${mine ? "justify-end" : ""}` : `absolute -bottom-3.5 flex gap-1 ${mine ? "right-2" : "left-2"}`}>
                        {[...counts].map(([emoji, c]) => (
                          <button key={emoji} type="button" className={`reaction-chip ${c.mine ? "is-mine" : ""}`} onClick={() => canSend && void react(m.id, emoji)} aria-label={`${emoji} ${c.n}${c.mine ? ", including you. Tap to remove yours" : ""}`}>
                            {emoji}
                            {c.n > 1 && <span className="text-xs">{c.n}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {canSend && v && v.kind !== "error" && (
                    <button
                      type="button"
                      className="react-trigger rounded-full p-1.5 text-mist opacity-0 transition-opacity hover:bg-paper hover:text-ink focus:opacity-100 group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        setReactingTo(reactingTo === m.id ? null : m.id);
                      }}
                      aria-label="React to this message"
                      aria-expanded={reactingTo === m.id}
                    >
                      <ReactIcon className="h-4 w-4" />
                    </button>
                  )}
                  {reactingTo === m.id && (
                    <div className={`reaction-bar absolute -top-12 z-10 ${mine ? "right-0" : "left-0"}`} role="menu" aria-label="Pick a reaction" onClick={(e) => e.stopPropagation()}>
                      {QUICK_REACTIONS.map((emoji) => (
                        <button key={emoji} type="button" role="menuitem" onClick={() => void react(m.id, emoji)} aria-label={`React with ${emoji}`}>
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </Fragment>
            );
          })
        )}
        {peerTyping && (
          <div className="mt-2.5 flex">
            <span className="bubble bubble-theirs bubble-new !py-3 text-mist" aria-hidden="true">
              <span className="typing-dots">
                <i />
                <i />
                <i />
              </span>
            </span>
          </div>
        )}
      </div>

      {/* composer */}
      {error && (
        <p role="alert" className="border-t border-line px-4 py-2 text-sm text-alert">
          {error}
        </p>
      )}
      {locked ? (
        <p className="border-t border-line bg-sage px-4 py-3 text-sm text-mist">{header?.blockedByMe ? "You blocked this student. Unblock them from the menu to send messages." : "You cannot send messages to this student."}</p>
      ) : peerNotReady ? (
        <p className="border-t border-line bg-sage px-4 py-3 text-sm text-mist">{header?.other.name} has not opened CampusPool since secure chat began. You can message each other as soon as they sign in, because nothing is ever sent unencrypted.</p>
      ) : (
        <>
          <form onSubmit={sendText} className="flex items-end gap-1.5 border-t border-line bg-paper px-2 py-2">
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" aria-label="Choose a photo or GIF to send" onChange={(e) => void sendFile(e.target.files?.[0])} />
            <button type="button" className="btn btn-ghost btn-icon !border-transparent" disabled={uploading || !canSend} onClick={() => fileRef.current?.click()} aria-label="Send a photo or GIF from this device" title="Photo or GIF">
              <AttachIcon className={`h-5 w-5 ${uploading ? "animate-pulse" : ""}`} />
            </button>
            <button
              type="button"
              className={`btn btn-ghost btn-icon !border-transparent ${trayTab ? "is-on" : ""}`}
              onClick={() => setTrayTab(trayTab ? null : "stickers")}
              aria-label={trayTab ? "Close stickers, GIFs and emoji" : "Open stickers, GIFs and emoji"}
              aria-expanded={trayTab !== null}
              disabled={!canSend}
            >
              {trayTab ? <CloseIcon className="h-5 w-5" /> : <StickerIcon className="h-5 w-5" />}
            </button>
            <label className="min-w-0 flex-1">
              <span className="sr-only">Message</span>
              <textarea
                ref={inputRef}
                rows={1}
                className="field max-h-32 min-h-[2.6rem] resize-none !rounded-[1.3rem] !py-2.5"
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
                  if (e.target.value.trim()) sendTyping(id);
                }}
                onKeyDown={onKeyDown}
                onFocus={() => setTrayTab((t) => (t === "emoji" ? t : null))}
                maxLength={1000}
                placeholder={canSend ? `Message ${firstName}` : "Getting secure chat ready..."}
                autoComplete="off"
                disabled={!canSend}
              />
            </label>
            <button type="submit" className="btn btn-primary btn-icon !p-2.5" disabled={!text.trim() || busy || !canSend} aria-label="Send">
              <SendIcon className="h-5 w-5" />
            </button>
          </form>
          {trayTab && (
            <Tray
              tab={trayTab}
              setTab={setTrayTab}
              onSticker={(s) => void sendSticker(s)}
              onGif={(g) => void sendGif(g)}
              onEmoji={(e) => {
                setText((t) => t + e);
                inputRef.current?.focus();
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

export default function ThreadPage() {
  const params = useParams<{ id: string }>();
  return (
    <Ready>
      <SecureChatGate>
        <Thread id={params.id} />
      </SecureChatGate>
    </Ready>
  );
}
