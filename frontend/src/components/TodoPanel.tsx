"use client";

import Link from "next/link";
import { useMemo } from "react";
import { formatInr, isPast } from "@/lib/format";
import { incomingRequests } from "@/lib/selectors";
import { personName, useStore } from "@/lib/store";
import { Avatar } from "./Avatar";
import { StudentLabel } from "./StudentLabel";
import { ArrowIcon, CheckIcon, CloseIcon } from "./Icons";

type Task = { key: string; text: string; href: string; cta: string };

/** Everything waiting on the student: requests to answer, payments, and loose ends. */
export function TodoPanel() {
  const store = useStore();
  const { actions, rides, payments, me } = store;

  const requests = useMemo(() => incomingRequests(store).filter((r) => r.status === "PENDING" && !r.restricted), [store]);

  const tasks = useMemo(() => {
    const out: Task[] = [];
    const myRideIds = new Set(rides.filter((r) => r.creatorId === "me").map((r) => r.id));
    const toConfirm = payments.filter((p) => myRideIds.has(p.rideId) && p.status === "PENDING" && p.riderMarkedPaid).length;
    if (toConfirm > 0) out.push({ key: "confirm", text: `${toConfirm} rider${toConfirm === 1 ? "" : "s"} say they paid you. Confirm once the money arrives.`, href: "/activities", cta: "Review payments" });
    const owed = payments.filter((p) => p.studentId === "me" && p.status === "PENDING");
    if (owed.length > 0) {
      const total = owed.reduce((sum, p) => sum + p.amount, 0);
      out.push({ key: "owed", text: `You owe ${formatInr(total)} for ${owed.length} completed ride${owed.length === 1 ? "" : "s"}.`, href: "/activities", cta: "See what you owe" });
    }
    rides
      .filter((r) => r.creatorId === "me" && (r.status === "PENDING" || r.status === "ONGOING") && isPast(r.date, r.time))
      .forEach((r) => out.push({ key: `finish-${r.id}`, text: `Your ride to ${r.destination} has left. Enter the actual fare to split it.`, href: `/rides/${r.id}`, cta: "Complete ride" }));
    if (!me.upiId) out.push({ key: "upi", text: "Add your UPI ID so riders know where to send their share.", href: "/profile", cta: "Open profile" });
    return out;
  }, [rides, payments, me.upiId]);

  const decide = (kind: "ride" | "activity", id: string, approve: boolean) =>
    kind === "ride" ? actions.decideRideRequest(id, approve) : actions.decideActivityRequest(id, approve);

  const empty = requests.length === 0 && tasks.length === 0;

  return (
    <section className="card p-6" aria-labelledby="todo-title">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">To do</p>
          <h2 id="todo-title" className="font-display text-2xl font-semibold">
            Waiting on you
          </h2>
        </div>
        <Link href="/requests" className="text-sm font-medium text-forest underline underline-offset-4">
          All requests
        </Link>
      </div>

      {empty && <p className="rounded-xl bg-sage px-4 py-4 text-mist">You are all caught up. New requests and payment updates will appear here.</p>}

      {requests.length > 0 && (
        <ul className="divide-y divide-line">
          {requests.slice(0, 4).map((r) => (
            <li key={`${r.kind}-${r.id}`} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="flex items-center gap-3">
                <Avatar userId={r.requesterId} name={personName(store, r.requesterId)} />
                <div>
                  <p>
                    <StudentLabel id={r.requesterId} className="font-medium" />
                  </p>
                  <p className="text-sm text-mist">{r.title}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn btn-good btn-sm" onClick={() => decide(r.kind, r.id, true)}>
                  <CheckIcon className="h-4 w-4" /> Accept
                </button>
                <button type="button" className="btn btn-bad btn-sm" onClick={() => decide(r.kind, r.id, false)}>
                  <CloseIcon className="h-4 w-4" /> Decline
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {tasks.length > 0 && (
        <ul className={`space-y-2 ${requests.length > 0 ? "mt-4 border-t border-line pt-4" : ""}`}>
          {tasks.map((t) => (
            <li key={t.key} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-sage/70 px-4 py-3 text-sm">
              <span>{t.text}</span>
              <Link href={t.href} className="inline-flex items-center gap-1 font-semibold text-forest underline-offset-4 hover:underline">
                {t.cta} <ArrowIcon className="h-4 w-4" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
