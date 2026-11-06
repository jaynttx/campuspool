"use client";

import { useState } from "react";
import type { Ride } from "@/data/types";
import { personName, useStore } from "@/lib/store";
import { Avatar } from "./Avatar";

function Stars({ value, onPick, disabled }: { value: number; onPick: (n: number) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Stars out of 5" className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
          disabled={disabled}
          onClick={() => onPick(n)}
          className={`h-9 w-9 rounded-lg border text-lg leading-none transition-colors ${value >= n ? "border-forest bg-lime text-forest-deep" : "border-line bg-paper text-mist hover:bg-sage"}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function RateRow({ rideId, personId }: { rideId: string; personId: string }) {
  const store = useStore();
  const done = store.myRatings.find((r) => r.rideId === rideId && r.rateeId === personId);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const name = personName(store, personId);

  return (
    <li className="py-4">
      <div className="mb-2 flex items-center gap-3">
        <Avatar name={name} userId={personId} size={32} />
        <span className="font-medium">{name}</span>
      </div>
      {done ? (
        <p className="text-sm text-mist">You rated {name.split(" ")[0]} {done.stars} out of 5.</p>
      ) : (
        <div className="space-y-2">
          <Stars value={stars} onPick={setStars} disabled={busy} />
          <label>
            <span className="sr-only">Optional comment</span>
            <input className="field" maxLength={300} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Optional: how was it? Only they see this, without your name." />
          </label>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={stars === 0 || busy}
            onClick={async () => {
              setBusy(true);
              await store.actions.rateRide(rideId, personId, stars, comment);
              setBusy(false);
            }}
          >
            Send rating
          </button>
        </div>
      )}
    </li>
  );
}

/** After a completed ride: riders rate the creator, and the creator rates each rider. */
export function RatePanel({ ride }: { ride: Ride }) {
  const mine = ride.creatorId === "me";
  const people = mine ? ride.participants : [ride.creatorId];
  if (people.length === 0) return null;
  return (
    <section className="card p-5" aria-labelledby="rate-title">
      <h2 id="rate-title" className="font-display text-2xl font-semibold">
        Rate this ride
      </h2>
      <p className="mt-1 text-sm text-mist">Ratings help other students decide who to travel with. Comments are shown only to the person you rate, without your name.</p>
      <ul className="mt-2 divide-y divide-line">
        {people.map((p) => (
          <RateRow key={p} rideId={ride.id} personId={p} />
        ))}
      </ul>
    </section>
  );
}
