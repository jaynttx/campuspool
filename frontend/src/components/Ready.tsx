"use client";

import type { ReactNode } from "react";
import { useStore } from "@/lib/store";
import { InboxIcon } from "./Icons";

export function Ready({ children }: { children: ReactNode }) {
  const { ready } = useStore();
  if (!ready) {
    return (
      <div aria-busy="true" aria-label="Loading" role="status" className="space-y-4">
        <div className="skeleton h-10 w-2/3" />
        <div className="skeleton h-4 w-1/3" />
        <div className="skeleton h-40" />
        <div className="skeleton h-40" />
      </div>
    );
  }
  return <>{children}</>;
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong bg-paper/60 px-6 py-10 text-center text-mist">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-sage text-forest">
        <InboxIcon className="h-5 w-5" />
      </span>
      <p className="max-w-sm">{children}</p>
    </div>
  );
}
