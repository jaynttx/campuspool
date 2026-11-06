"use client";

import { formatInr, individualShare } from "@/lib/format";
import { personName, personUpi, rideHeadcount, useStore } from "@/lib/store";
import type { Ride } from "@/data/types";
import { Avatar } from "./Avatar";
import { PaymentPill } from "./StatusPill";

function upiLink(upiId: string, name: string, amount: number, note: string) {
  const q = new URLSearchParams({ pa: upiId, pn: name, am: amount.toFixed(2), cu: "INR", tn: note });
  return `upi://pay?${q.toString()}`;
}

/** Settlement for a completed ride. CampusPool never moves money; it only tracks who says they paid. */
export function PaymentPanel({ ride }: { ride: Ride }) {
  const store = useStore();
  const { actions, payments } = store;
  const list = payments.filter((p) => p.rideId === ride.id);
  const fare = ride.actualFare ?? 0;
  const n = rideHeadcount(ride);
  const creator = personName(store, ride.creatorId);
  const iAmCreator = ride.creatorId === "me";
  const creatorUpi = personUpi(store, ride.creatorId);

  return (
    <section className="card p-5">
      <h2 className="font-display text-2xl font-semibold">Fare split</h2>
      <p className="tabular mt-2 text-xl">
        {formatInr(fare)} ÷ {n} = <span className="font-semibold text-verified">{formatInr(individualShare(fare, n))}</span> each
      </p>
      <p className="mt-1 text-sm text-mist">
        The creator entered the actual fare. Everyone in the ride, including the creator, pays an equal share. Payments are made directly between students by UPI;
        CampusPool does not hold or move any money.
      </p>

      {list.length === 0 ? (
        <p className="mt-4 text-mist">No riders joined this ride, so nothing is owed.</p>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {list.map((p) => {
            const mine = p.studentId === "me";
            const name = personName(store, p.studentId);
            return (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="flex items-center gap-3">
                  <Avatar name={name} userId={p.studentId} />
                  <div>
                    <p className="font-medium">{mine ? "You" : name}</p>
                    <p className="tabular text-sm text-mist">{formatInr(p.amount)}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <PaymentPill status={p.status} riderMarkedPaid={p.riderMarkedPaid} />
                  {mine && p.status === "PENDING" && (
                    <>
                      {creatorUpi ? (
                        <a className="btn btn-ghost btn-sm" href={upiLink(creatorUpi, creator, p.amount, `CampusPool ride to ${ride.destination}`)}>
                          Open UPI app
                        </a>
                      ) : null}
                      <button type="button" className="btn btn-good btn-sm" disabled={p.riderMarkedPaid} onClick={() => actions.markPaid(p.id)}>
                        {p.riderMarkedPaid ? "Waiting for creator" : "I have paid"}
                      </button>
                    </>
                  )}
                  {iAmCreator && p.status === "PENDING" && (
                    <button type="button" className="btn btn-good btn-sm" onClick={() => actions.confirmPayment(p.id)}>
                      Confirm received
                    </button>
                  )}
                </div>
                {mine && p.status === "PENDING" && (
                  <p className="w-full text-xs text-mist">
                    {creatorUpi ? `Pay ${creator} at ${creatorUpi}.` : `${creator} has not added a UPI ID yet. Ask them directly.`}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
