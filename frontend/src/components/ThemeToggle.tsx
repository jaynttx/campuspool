"use client";

import { usePrefs } from "@/lib/prefs";
import { MoonIcon, SunIcon } from "./Icons";

/** One tap between light and dark. Settings > Appearance also offers "match my device". */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { resolvedTheme, setTheme } = usePrefs();
  const dark = resolvedTheme === "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-full border border-line bg-paper transition-colors hover:bg-sage ${className}`}
    >
      {dark ? <SunIcon className="h-5 w-5 text-marigold" aria-hidden="true" /> : <MoonIcon className="h-5 w-5" aria-hidden="true" />}
    </button>
  );
}
