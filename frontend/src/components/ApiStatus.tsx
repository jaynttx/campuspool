"use client";

import { useEffect, useState } from "react";
import { fetchHealth, getApiUrl } from "@/lib/api";

type State = "checking" | "online" | "offline";

export function ApiStatus() {
  const [state, setState] = useState<State>("checking");

  useEffect(() => {
    const ctrl = new AbortController();
    fetchHealth(ctrl.signal)
      .then(() => setState("online"))
      .catch((err: unknown) => {
        if (!(err instanceof DOMException && err.name === "AbortError")) setState("offline");
      });
    return () => ctrl.abort();
  }, []);

  const dot = state === "online" ? "bg-verified" : state === "offline" ? "bg-alert" : "bg-mist";
  const text = state === "online" ? "API connected" : state === "offline" ? `API not reachable at ${getApiUrl()}` : "Checking API";

  return (
    <p className="flex items-center gap-2 text-sm text-mist" role="status">
      <span className={`h-2.5 w-2.5 rounded-full ${dot}`} aria-hidden="true" />
      {text}
    </p>
  );
}
