"use client";

import type { CSSProperties } from "react";
import { useStore } from "@/lib/store";

/** Initials get a hue from the name; globals.css (.tint) mixes it for light and dark themes. */
const HUES = ["#0f9d6e", "#6fa800", "#e89a00", "#2b86d9", "#e0457b", "#7a5af8", "#e0592a"];

/** Shows the student's photo when they have one, otherwise coloured initials. Pass userId ("me" or an id) to look the photo up. */
export function Avatar({ name, size = 36, userId, src }: { name: string; size?: number; userId?: string; src?: string | null }) {
  const store = useStore();
  const photo = src ?? (userId === "me" ? store.me.avatarUrl : userId ? store.people.find((p) => p.id === userId)?.avatarUrl : null);
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  const hue = HUES[[...name].reduce((n, ch) => n + ch.charCodeAt(0), 0) % HUES.length];

  if (photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photo} alt="" width={size} height={size} className="shrink-0 rounded-full bg-sage object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span aria-hidden="true" className="tint inline-flex shrink-0 items-center justify-center rounded-full font-semibold" style={{ width: size, height: size, fontSize: size * 0.38, "--hue": hue } as CSSProperties}>
      {initials || "?"}
    </span>
  );
}
