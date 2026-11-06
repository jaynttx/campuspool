"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "./api";

export type Status = "loading" | "anonymous" | "authed";
/** Why the visitor is signed out, so the login page can explain it. */
export type SignedOutReason = "required" | "expired" | "signed-out";
type MeResponse = { user: { id: "me"; email: string; name: string } };

type AuthContext = {
  status: Status;
  email: string | null;
  reason: SignedOutReason;
  /** Called by the login page once the server has set the session cookie. */
  signedIn: (email: string) => void;
  /** Called when any request returns 401. */
  markSignedOut: () => void;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthContext | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [email, setEmail] = useState<string | null>(null);
  const [reason, setReason] = useState<SignedOutReason>("required");

  useEffect(() => {
    let cancelled = false;
    api<MeResponse>("/auth/me")
      .then((r) => {
        if (cancelled) return;
        setEmail(r.user.email);
        setStatus("authed");
      })
      .catch(() => {
        // Not signed in, or the server is unreachable: the login screen explains what to do next.
        if (!cancelled) setStatus("anonymous");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signedIn = useCallback((e: string) => {
    setEmail(e);
    setStatus("authed");
  }, []);
  const markSignedOut = useCallback(() => {
    setReason("expired");
    setEmail(null);
    setStatus("anonymous");
  }, []);
  const signOut = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      setReason("signed-out");
      setEmail(null);
      setStatus("anonymous");
    }
  }, []);

  const value = useMemo(() => ({ status, email, reason, signedIn, markSignedOut, signOut }), [status, email, reason, signedIn, markSignedOut, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
