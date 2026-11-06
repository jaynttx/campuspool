"use client";

import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import { CheckIcon, CloseIcon } from "@/components/Icons";
import { PageHeader } from "@/components/PageHeader";
import { Empty, Ready } from "@/components/Ready";
import { StudentLabel } from "@/components/StudentLabel";
import { MessageButton } from "@/components/MessageButton";
import { Pill, StatusPill } from "@/components/StatusPill";
import { timeAgo } from "@/lib/format";
import { incomingRequests, sentRequests, type RequestItem } from "@/lib/selectors";
import { personName, useStore } from "@/lib/store";

function hrefFor(r: RequestItem) {
  return r.kind === "ride" ? `/rides/${r.targetId}` : `/company/${r.targetId}`;
}

function Requests() {
  const store = useStore();
  const { actions } = store;
  const [tab, setTab] = useState<"sent" | "review">("sent");
  const sent = sentRequests(store);
  const incoming = incomingRequests(store);
  const waiting = incoming.filter((r) => r.status === "PENDING");

  const decide = (r: RequestItem, approve: boolean) =>
    r.kind === "ride" ? actions.decideRideRequest(r.id, approve) : actions.decideActivityRequest(r.id, approve);

  return (
    <div>
      <PageHeader title="My Requests" intro="Requests you sent, and requests other students sent to your rides and activities." />

      <div role="tablist" aria-label="Request lists" className="mb-5 flex gap-2">
        <button role="tab" aria-selected={tab === "sent"} type="button" className={`btn ${tab === "sent" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("sent")}>
          Sent by me ({sent.length})
        </button>
        <button role="tab" aria-selected={tab === "review"} type="button" className={`btn ${tab === "review" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("review")}>
          To review ({waiting.length})
        </button>
      </div>

      {tab === "sent" &&
        (sent.length === 0 ? (
          <Empty>
            You have not asked to join anything yet. Browse the{" "}
            <Link href="/rides" className="font-medium text-forest underline underline-offset-4">
              Ride Pool
            </Link>{" "}
            or{" "}
            <Link href="/company" className="font-medium text-forest underline underline-offset-4">
              Find Company
            </Link>
            .
          </Empty>
        ) : (
          <ul className="space-y-3">
            {sent.map((r) => (
              <li key={`${r.kind}-${r.id}`} className="card p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <Link href={hrefFor(r)} className="font-medium underline-offset-4 hover:underline">
                      {r.title}
                    </Link>
                    <p className="text-sm text-mist">
                      {r.kind === "ride" ? "Ride" : "Activity"} by {personName(store, r.ownerId)} · sent {timeAgo(r.requestedOn)}
                    </p>
                  </div>
                  <StatusPill status={r.status} />
                </div>
                {r.status !== "REJECTED" && (
                  <div className="mt-3 border-t border-line pt-3">
                    <MessageButton userId={r.ownerId} label={`Message ${personName(store, r.ownerId).split(" ")[0]}`} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        ))}

      {tab === "review" &&
        (incoming.length === 0 ? (
          <Empty>No one has asked to join your rides or activities yet. New requests appear here as soon as they are sent.</Empty>
        ) : (
          <ul className="space-y-3">
            {incoming.map((r) => (
              <li key={`${r.kind}-${r.id}`} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-3">
                  <Avatar userId={r.requesterId} name={personName(store, r.requesterId)} />
                  <div>
                    <p className="flex items-center gap-2 font-medium">
                      <StudentLabel id={r.requesterId} /> {r.restricted && <Pill tone="mute">Restricted</Pill>}
                    </p>
                    <Link href={hrefFor(r)} className="text-sm text-mist underline-offset-4 hover:underline">
                      {r.title}
                    </Link>
                    <p className="text-xs text-mist">Asked {timeAgo(r.requestedOn)}</p>
                  </div>
                </div>
                {r.status === "PENDING" ? (
                  <div className="flex flex-wrap gap-2">
                    <MessageButton userId={r.requesterId} />
                    <button type="button" className="btn btn-good btn-sm" onClick={() => decide(r, true)}>
                      <CheckIcon className="h-4 w-4" /> Accept
                    </button>
                    <button type="button" className="btn btn-bad btn-sm" onClick={() => decide(r, false)}>
                      <CloseIcon className="h-4 w-4" /> Decline
                    </button>
                  </div>
                ) : (
                  <StatusPill status={r.status} />
                )}
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

export default function RequestsPage() {
  return (
    <Ready>
      <Requests />
    </Ready>
  );
}
