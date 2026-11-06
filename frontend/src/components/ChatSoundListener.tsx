"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { usePrefs } from "@/lib/prefs";
import { playSound, unlockAudio } from "@/lib/sounds";
import { useStore } from "@/lib/store";

/** A soft ping when a new message arrives while you are somewhere else in the app. The open chat plays its own sound. */
export function ChatSoundListener() {
  const { chatUnread, ready } = useStore();
  const { sounds } = usePrefs();
  const pathname = usePathname();
  const previous = useRef<number | null>(null);

  // Browsers allow sound only after the first tap or key press.
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (previous.current !== null && chatUnread > previous.current && !pathname.startsWith("/chats/")) playSound("ping", sounds);
    previous.current = chatUnread;
  }, [chatUnread, ready, pathname, sounds]);

  return null;
}
