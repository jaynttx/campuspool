"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { ChatSoundListener } from "./ChatSoundListener";
import { DeviceLinkPrompt } from "./SecureChatGate";
import { MobileNav, Sidebar } from "./Sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  const { status, reason } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const onLogin = pathname === "/login";
  const isPublic = onLogin || pathname === "/privacy";

  useEffect(() => {
    if (status === "anonymous" && !isPublic) {
      const next = reason === "required" && pathname !== "/" ? `&next=${encodeURIComponent(pathname)}` : "";
      router.replace(`/login?notice=${reason}${next}`);
    }
    if (status === "authed" && onLogin) {
      const wanted = new URLSearchParams(window.location.search).get("next");
      const safe = wanted && wanted.startsWith("/") && !wanted.startsWith("//") && !wanted.startsWith("/login") ? wanted : "/";
      router.replace(safe);
    }
  }, [status, reason, pathname, onLogin, isPublic, router]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center" role="status" aria-label="Loading">
        <div className="skeleton h-10 w-48" />
      </div>
    );
  }
  if (status === "anonymous") {
    if (onLogin) return <>{children}</>;
    return isPublic ? <div className="mx-auto max-w-3xl px-4 py-10">{children}</div> : null;
  }
  if (onLogin) return null;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <a href="#content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-forest focus:px-4 focus:py-2 focus:text-white">
        Skip to content
      </a>
      <Sidebar />
      <MobileNav />
      <main id="content" className="min-w-0 flex-1 px-4 pb-28 pt-6 md:px-10 md:pb-14 md:pt-10">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
      <DeviceLinkPrompt />
      <ChatSoundListener />
    </div>
  );
}
