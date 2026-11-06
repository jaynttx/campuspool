"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";
import { BellIcon, MessageIcon } from "./Icons";

function Badge({ n }: { n: number }) {
  if (n <= 0) return null;
  return <span className="tabular absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-coral px-1 text-[11px] font-bold text-white ring-2 ring-paper dark:text-cream">{n}</span>;
}

const ROUND = "relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-line bg-paper transition-colors hover:bg-sage";

export function BellLink() {
  const { notifications, ready } = useStore();
  const unread = ready ? notifications.filter((n) => !n.read).length : 0;
  return (
    <Link href="/notifications" className={ROUND} aria-label={`Notifications, ${unread} unread`}>
      <BellIcon className="h-5 w-5" />
      <Badge n={unread} />
    </Link>
  );
}

export function MessagesLink() {
  const { chatUnread, ready } = useStore();
  const n = ready ? chatUnread : 0;
  return (
    <Link href="/chats" className={ROUND} aria-label={`Messages, ${n} unread`}>
      <MessageIcon className="h-5 w-5" />
      <Badge n={n} />
    </Link>
  );
}
