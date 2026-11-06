"use client";

import { useEffect, useRef, useState } from "react";
import { gifSearchEnabled, searchGifs, type Gif } from "@/lib/giphy";
import { SearchIcon } from "../Icons";
import { STICKER_IDS, STICKERS, Sticker } from "./Stickers";

export type TrayTab = "stickers" | "gifs" | "emoji";

const EMOJI: { group: string; items: string[] }[] = [
  { group: "Faces", items: ["😀", "😂", "🤣", "😊", "😍", "🥹", "😎", "🤔", "😴", "😅", "🙃", "😬", "😭", "😤", "🥳", "🤯"] },
  { group: "Gestures", items: ["👍", "👎", "👏", "🙏", "🤝", "👋", "✌️", "🤞", "💪", "🫡", "🙌", "👀"] },
  { group: "Campus", items: ["🛺", "🚌", "🚗", "🚉", "✈️", "📍", "⏰", "📚", "✏️", "☕", "🍜", "🍕", "🏸", "🏏", "⚽", "🎬"] },
  { group: "Feelings", items: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🔥", "✨", "💯", "🎉", "✅", "❌", "💸", "₹"] },
];

function GifPanel({ onPick }: { onPick: (g: Gif) => void }) {
  const [query, setQuery] = useState("");
  const [gifs, setGifs] = useState<Gif[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!gifSearchEnabled) return;
    const ctrl = new AbortController();
    const t = window.setTimeout(() => {
      setError("");
      searchGifs(query, ctrl.signal)
        .then(setGifs)
        .catch((e: unknown) => {
          if (!(e instanceof DOMException && e.name === "AbortError")) setError(e instanceof Error ? e.message : "GIF search failed.");
        });
    }, 300);
    return () => {
      ctrl.abort();
      window.clearTimeout(t);
    };
  }, [query]);

  if (!gifSearchEnabled) {
    return (
      <div className="space-y-2 p-4 text-sm text-mist">
        <p className="font-medium text-ink">GIF search is not switched on for this site.</p>
        <p>
          You can still send a GIF from your device with the paperclip. It is encrypted like a photo. To search GIPHY, whoever runs CampusPool adds a free key as <code className="rounded bg-sage px-1">NEXT_PUBLIC_GIPHY_API_KEY</code> (see the README).
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-3 pb-2 pt-1">
        <label className="relative block">
          <span className="sr-only">Search GIFs</span>
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist" aria-hidden="true" />
          <input className="field !py-2 pl-9" placeholder="Search GIPHY" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-2">
        {error ? (
          <p className="p-3 text-sm text-alert">{error}</p>
        ) : gifs === null ? (
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="skeleton h-24" />
            ))}
          </div>
        ) : gifs.length === 0 ? (
          <p className="p-3 text-sm text-mist">No GIFs for that. Try another word.</p>
        ) : (
          <ul className="columns-3 gap-2">
            {gifs.map((g) => (
              <li key={g.id} className="mb-2 break-inside-avoid">
                <button type="button" className="tray-cell block w-full overflow-hidden" onClick={() => onPick(g)} title={g.title}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={g.preview} alt={g.title} width={g.pw} height={g.ph} loading="lazy" referrerPolicy="no-referrer" className="h-auto w-full rounded-[0.8rem]" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="px-3 pb-2 text-right text-[11px] font-semibold text-mist">Powered by GIPHY</p>
    </div>
  );
}

/** The panel under the message box. Stickers and emoji are built in; GIFs come from GIPHY when it is switched on. */
export function Tray({ tab, setTab, onSticker, onGif, onEmoji }: { tab: TrayTab; setTab: (t: TrayTab) => void; onSticker: (id: string) => void; onGif: (g: Gif) => void; onEmoji: (e: string) => void }) {
  const tabs: { id: TrayTab; label: string }[] = [
    { id: "stickers", label: "Stickers" },
    { id: "gifs", label: "GIFs" },
    { id: "emoji", label: "Emoji" },
  ];
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [tab]);

  return (
    <div className="tray flex h-72 flex-col rounded-b-2xl">
      <div role="tablist" aria-label="Stickers, GIFs and emoji" className="flex gap-1 px-3 py-2">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" id={`tray-${t.id}`} aria-selected={tab === t.id} aria-controls="tray-panel" className="tray-tab" onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div ref={listRef} id="tray-panel" role="tabpanel" aria-labelledby={`tray-${tab}`} className="min-h-0 flex-1 overflow-y-auto">
        {tab === "stickers" && (
          <ul className="grid grid-cols-4 gap-1 px-2 pb-3 sm:grid-cols-6">
            {STICKER_IDS.map((id) => (
              <li key={id}>
                <button type="button" className="tray-cell flex w-full items-center justify-center p-1" onClick={() => onSticker(id)} aria-label={`Send sticker: ${STICKERS[id].caption}`}>
                  <Sticker id={id} size={76} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {tab === "gifs" && <GifPanel onPick={onGif} />}
        {tab === "emoji" && (
          <div className="space-y-3 px-3 pb-3">
            {EMOJI.map((g) => (
              <div key={g.group}>
                <p className="mb-1 text-xs font-semibold text-mist">{g.group}</p>
                <div className="grid grid-cols-8 gap-1">
                  {g.items.map((e) => (
                    <button key={e} type="button" className="tray-cell h-10 text-2xl" onClick={() => onEmoji(e)} aria-label={`Add ${e}`}>
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
