"use client";

/**
 * Preferences that belong to this device rather than the account: colour theme, chat bubble colour and sounds.
 * They are read before the first paint by the small script in app/layout.tsx, so the page never flashes the wrong theme.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ThemePref = "system" | "light" | "dark";
export type BubbleColor = "emerald" | "marigold" | "coral" | "lagoon" | "grape";

export const BUBBLES: { id: BubbleColor; label: string; swatch: string }[] = [
  { id: "emerald", label: "Emerald", swatch: "#0F6B4C" },
  { id: "marigold", label: "Marigold", swatch: "#F5A300" },
  { id: "coral", label: "Coral", swatch: "#CC3341" },
  { id: "lagoon", label: "Lagoon", swatch: "#1670B8" },
  { id: "grape", label: "Grape", swatch: "#6A4CE0" },
];

const KEYS = { theme: "cp-theme", bubble: "cp-bubble", sounds: "cp-sounds" } as const;

/** Runs before React loads. Keep it tiny and dependency-free. */
export const THEME_BOOT_SCRIPT = `(function(){try{var d=document.documentElement,t=localStorage.getItem("${KEYS.theme}")||"system",dark=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);d.dataset.theme=dark?"dark":"light";d.dataset.bubble=localStorage.getItem("${KEYS.bubble}")||"emerald";}catch(e){}})();`;

type Ctx = {
  theme: ThemePref;
  resolvedTheme: "light" | "dark";
  bubble: BubbleColor;
  sounds: boolean;
  setTheme(t: ThemePref): void;
  setBubble(b: BubbleColor): void;
  setSounds(on: boolean): void;
};

const PrefsContext = createContext<Ctx | null>(null);

const read = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode: the choice lasts for this visit */
  }
};

const systemDark = () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePref>("system");
  const [bubble, setBubbleState] = useState<BubbleColor>("emerald");
  const [sounds, setSoundsState] = useState(true);
  const [dark, setDark] = useState(false);

  // Load saved choices once on the client.
  useEffect(() => {
    const t = read(KEYS.theme);
    if (t === "light" || t === "dark" || t === "system") setThemeState(t);
    const b = read(KEYS.bubble);
    if (BUBBLES.some((x) => x.id === b)) setBubbleState(b as BubbleColor);
    setSoundsState(read(KEYS.sounds) !== "off");
    setDark(systemDark());
  }, []);

  // Follow the operating system while "system" is chosen.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setDark(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const resolvedTheme: "light" | "dark" = theme === "system" ? (dark ? "dark" : "light") : theme;

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolvedTheme;
    root.dataset.bubble = bubble;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolvedTheme === "dark" ? "#0D1A1C" : "#F1F5EF");
  }, [resolvedTheme, bubble]);

  const setTheme = useCallback((t: ThemePref) => {
    setThemeState(t);
    write(KEYS.theme, t);
  }, []);
  const setBubble = useCallback((b: BubbleColor) => {
    setBubbleState(b);
    write(KEYS.bubble, b);
  }, []);
  const setSounds = useCallback((on: boolean) => {
    setSoundsState(on);
    write(KEYS.sounds, on ? "on" : "off");
  }, []);

  const value = useMemo(() => ({ theme, resolvedTheme, bubble, sounds, setTheme, setBubble, setSounds }), [theme, resolvedTheme, bubble, sounds, setTheme, setBubble, setSounds]);
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): Ctx {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error("usePrefs must be used inside <PrefsProvider>");
  return ctx;
}
