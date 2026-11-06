"use client";

import { useRef, useState } from "react";
import { downscaleToJpeg } from "@/lib/image";
import { useStore } from "@/lib/store";
import { Avatar } from "./Avatar";
import { CameraIcon } from "./Icons";

export function AvatarEditor() {
  const { me, actions } = useStore();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onPick(file: File | undefined) {
    if (!file) return;
    setError("");
    if (!file.type.startsWith("image/")) return setError("Choose an image file.");
    setBusy(true);
    try {
      const blob = await downscaleToJpeg(file, 512);
      await actions.uploadAvatar(blob);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not use that image.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar name={me.name || "?"} userId="me" size={72} />
      <div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => input.current?.click()}>
            <CameraIcon className="h-4 w-4" aria-hidden="true" /> {me.avatarUrl ? "Change photo" : "Add photo"}
          </button>
          {me.avatarUrl && (
            <button type="button" className="btn btn-bad btn-sm" disabled={busy} onClick={() => void actions.removeAvatar()}>
              Remove
            </button>
          )}
        </div>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Choose a profile photo" onChange={(e) => void onPick(e.target.files?.[0])} />
        <p className="hint">JPEG, PNG or WebP. It is cropped to a square.</p>
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
