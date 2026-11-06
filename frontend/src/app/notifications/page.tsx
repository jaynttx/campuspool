"use client";

import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { Empty, Ready } from "@/components/Ready";
import { timeAgo } from "@/lib/format";
import { useStore } from "@/lib/store";

function Notifications() {
  const { notifications, actions } = useStore();
  const unread = notifications.filter((n) => !n.read).length;
  return (
    <div>
      <PageHeader
        title="Notifications"
        intro="New requests, accepted or declined answers, and ride updates."
        action={
          <button type="button" className="btn btn-ghost" disabled={unread === 0} onClick={() => actions.markAllRead()}>
            Mark all as read
          </button>
        }
      />
      {notifications.length === 0 ? (
        <Empty>Nothing yet. You will see an entry here whenever someone sends or answers a request.</Empty>
      ) : (
        <ul className="space-y-3">
          {notifications.map((n) => {
            const body = (
              <>
                <p className={n.read ? "text-mist" : "font-medium"}>{n.text}</p>
                <p className="text-xs text-mist">{timeAgo(n.at)}</p>
              </>
            );
            return (
              <li key={n.id} className={`card flex items-start gap-3 p-4 ${n.read ? "" : "border-l-4 border-l-forest"}`}>
                {n.href ? (
                  <Link href={n.href} className="flex-1" onClick={() => actions.markRead(n.id)}>
                    {body}
                  </Link>
                ) : (
                  <div className="flex-1">{body}</div>
                )}
                {!n.read && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => actions.markRead(n.id)}>
                    Mark read
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <Ready>
      <Notifications />
    </Ready>
  );
}
