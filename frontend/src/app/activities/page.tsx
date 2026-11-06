"use client";

import Link from "next/link";
import { LifecyclePill, PaymentPill } from "@/components/StatusPill";
import { PageHeader } from "@/components/PageHeader";
import { Empty, Ready } from "@/components/Ready";
import { dayLabel, formatInr, sortKey } from "@/lib/format";
import { useStore } from "@/lib/store";

function MyActivities() {
  const { rides, activities, payments } = useStore();
  const myRides = rides
    .filter((r) => r.creatorId === "me" || r.participants.includes("me"))
    .sort((a, b) => sortKey(b.date, b.time).localeCompare(sortKey(a.date, a.time)));
  const myActivities = activities
    .filter((a) => a.creatorId === "me" || a.participants.includes("me"))
    .sort((a, b) => sortKey(b.date, b.time).localeCompare(sortKey(a.date, a.time)));

  return (
    <div className="space-y-8">
      <PageHeader title="My Activities" intro="Rides and activities you created or joined, with payment status for completed rides." />

      <section>
        <h2 className="mb-3 font-display text-2xl font-semibold">My rides</h2>
        {myRides.length === 0 ? (
          <Empty>No rides yet. Offer one or request a seat in the Ride Pool.</Empty>
        ) : (
          <ul className="space-y-3">
            {myRides.map((r) => {
              const myPay = payments.find((p) => p.rideId === r.id && p.studentId === "me");
              const unpaid = payments.filter((p) => p.rideId === r.id && p.status === "PENDING").length;
              return (
                <li key={r.id} className="card lift p-4">
                  <Link href={`/rides/${r.id}`} className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{r.destination}</p>
                      <p className="text-sm text-mist">
                        {r.creatorId === "me" ? "You are the creator" : "You are a rider"} · {dayLabel(r.date)}, {r.time}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {myPay && (
                        <>
                          <span className="tabular text-sm">{formatInr(myPay.amount)}</span>
                          <PaymentPill status={myPay.status} riderMarkedPaid={myPay.riderMarkedPaid} />
                        </>
                      )}
                      {r.creatorId === "me" && r.status === "COMPLETED" && unpaid > 0 && (
                        <span className="text-sm text-signal">{unpaid} unpaid</span>
                      )}
                      <LifecyclePill status={r.status} />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-display text-2xl font-semibold">My activities</h2>
        {myActivities.length === 0 ? (
          <Empty>No activities yet. Post one or ask to join in Find Company.</Empty>
        ) : (
          <ul className="space-y-3">
            {myActivities.map((a) => (
              <li key={a.id} className="card lift p-4">
                <Link href={`/company/${a.id}`} className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{a.title}</p>
                    <p className="text-sm text-mist">
                      {a.creatorId === "me" ? "You are the host" : "You are a participant"} · {dayLabel(a.date)}, {a.time}
                    </p>
                  </div>
                  <LifecyclePill status={a.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function MyActivitiesPage() {
  return (
    <Ready>
      <MyActivities />
    </Ready>
  );
}
