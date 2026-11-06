"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { Avatar } from "./Avatar";
import { BellLink, MessagesLink } from "./BellLink";
import { CalendarIcon, CarIcon, DashboardIcon, InboxIcon, LogOutIcon, MessageIcon, PeopleIcon, SettingsIcon, ShieldCheckIcon, UserIcon } from "./Icons";
import { Wordmark } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

type NavItem = { href: string; label: string; short: string; Icon: LucideIcon };

export const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", short: "Home", Icon: DashboardIcon },
  { href: "/rides", label: "Ride Pool", short: "Rides", Icon: CarIcon },
  { href: "/company", label: "Find Company", short: "Company", Icon: PeopleIcon },
  { href: "/requests", label: "My Requests", short: "Requests", Icon: InboxIcon },
  { href: "/activities", label: "My Activities", short: "Activities", Icon: CalendarIcon },
  { href: "/profile", label: "Profile", short: "Profile", Icon: UserIcon },
];

function useIsActive() {
  const pathname = usePathname();
  return (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
}

export function Sidebar() {
  const isActive = useIsActive();
  const { me, chatUnread } = useStore();
  const { signOut } = useAuth();
  const settingsActive = isActive("/settings");
  return (
    <aside className="hidden border-r border-line bg-paper md:sticky md:top-0 md:flex md:h-screen md:w-64 md:shrink-0 md:flex-col">
      <div className="flex items-center justify-between px-5 pb-6 pt-7">
        <Link href="/" aria-label="CampusPool home">
          <Wordmark />
        </Link>
        <BellLink />
      </div>
      <p className="eyebrow px-6 pb-2">Menu</p>
      <nav aria-label="Main" className="flex-1 space-y-1 px-3">
        {[...NAV, { href: "/chats", label: "Messages", short: "Chats", Icon: MessageIcon }, ...(me.isAdmin ? [{ href: "/admin", label: "Admin", short: "Admin", Icon: ShieldCheckIcon }] : [])].map(({ href, label, Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition-colors ${
                active ? "bg-forest font-medium text-white" : "text-ink hover:bg-sage"
              }`}
            >
              <Icon className={`h-[18px] w-[18px] ${active ? "text-lime" : "text-mist group-hover:text-ink"}`} strokeWidth={2} />
              {label}
              {href === "/chats" && chatUnread > 0 && <span className="tabular ml-auto rounded-full bg-coral px-2 text-xs font-bold text-white dark:text-cream">{chatUnread}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="space-y-3 border-t border-line px-3 py-4">
        <div className="flex items-center gap-2">
        <Link
          href="/settings"
          aria-current={settingsActive ? "page" : undefined}
          className={`flex flex-1 items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition-colors ${
            settingsActive ? "bg-forest font-medium text-white" : "text-ink hover:bg-sage"
          }`}
        >
          <SettingsIcon className={`h-[18px] w-[18px] ${settingsActive ? "text-lime" : "text-mist"}`} strokeWidth={2} />
          Settings
        </Link>
          <ThemeToggle />
        </div>
        <div className="flex items-center gap-3 rounded-xl bg-sage/70 px-3 py-2.5">
          <Avatar name={me.name || "?"} userId="me" size={34} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{me.name}</p>
            <p className="truncate text-xs text-mist">{me.email}</p>
          </div>
          <button type="button" onClick={() => void signOut()} aria-label="Sign out" title="Sign out" className="rounded-lg p-2 text-mist hover:bg-paper hover:text-ink">
            <LogOutIcon className="h-4 w-4" />
          </button>
        </div>
        <p className="flex gap-4 px-3 text-xs text-mist">
          <Link href="/feedback" className="underline underline-offset-4 hover:text-ink">
            Feedback
          </Link>
          <Link href="/privacy" className="underline underline-offset-4 hover:text-ink">
            Privacy
          </Link>
        </p>
      </div>
    </aside>
  );
}

export function MobileNav() {
  const isActive = useIsActive();
  const { me } = useStore();
  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-paper px-4 py-3 md:hidden">
        <Link href="/" aria-label="CampusPool home">
          <Wordmark />
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/settings" aria-label="Settings" className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line bg-paper hover:bg-sage">
            <SettingsIcon className="h-5 w-5" />
          </Link>
          {me.isAdmin && (
            <Link href="/admin" aria-label="Admin" className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line bg-paper hover:bg-sage">
              <ShieldCheckIcon className="h-5 w-5" />
            </Link>
          )}
          <MessagesLink />
          <BellLink />
        </div>
      </header>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-line bg-paper pb-[env(safe-area-inset-bottom)] md:hidden">
        {NAV.map(({ href, short, Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center gap-1 py-2 text-[10.5px] ${active ? "font-semibold text-forest" : "text-mist"}`}
            >
              <span className={`flex h-7 w-11 items-center justify-center rounded-full transition-colors ${active ? "bg-lime" : ""}`}>
                <Icon className="h-5 w-5" strokeWidth={active ? 2.3 : 1.9} />
              </span>
              {short}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
