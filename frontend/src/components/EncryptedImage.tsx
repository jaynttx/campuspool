"use client";

import { useEffect, useState } from "react";
import { apiBytes, errorMessage } from "@/lib/api";
import { decryptBytes } from "@/lib/e2ee";

/** Downloads an encrypted photo and opens it in this browser only. */
export function EncryptedImage({ url, iv, mime, cryptoKey, context }: { url: string; iv: string; mime: string; cryptoKey: CryptoKey; context: Uint8Array<ArrayBuffer> }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const ctrl = new AbortController();
    let objectUrl: string | null = null;
    (async () => {
      try {
        const cipher = await apiBytes(url, ctrl.signal);
        const plain = await decryptBytes(cryptoKey, cipher, iv, context);
        objectUrl = URL.createObjectURL(new Blob([plain], { type: mime }));
        setSrc(objectUrl);
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) setError(errorMessage(e) || "Could not open this photo.");
      }
    })();
    return () => {
      ctrl.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, iv, mime, cryptoKey, context]);

  if (error) return <p className="mb-1 text-sm opacity-80">This photo could not be opened.</p>;
  if (!src) return <div className="skeleton mb-1 h-40 w-56" aria-busy="true" />;
  return (
    <a href={src} target="_blank" rel="noreferrer" aria-label="Open photo in a new tab">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="Photo sent in this chat" className="mb-1 max-h-64 rounded-xl object-cover" />
    </a>
  );
}
