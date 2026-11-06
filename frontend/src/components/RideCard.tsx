"use client";

import Link from "next/link";
import { dayLabel, formatInr, individualShare } from "@/lib/format";
import { personName, seatsLeft, useStore } from "@/lib/store";
import type { Ride } from "@/data/types";
import { Avatar } from "./Avatar";
import { RequestRideButton } from "./RequestSeatButton";
import { RouteLine } from "./RouteLine";
import { StudentLabel } from "./StudentLabel";
import { SeatPips } from "./SeatPips";
import { LifecyclePill } from "./StatusPill";

export function RideCard({ ride }: { ride: Ride }) {
  const store = useStore();
  const creator = personName(store, ride.creatorId);
  return (
    <li className="card lift grid overflow-hidden sm:grid-cols-[150px_1fr]">
      <Link
        href={`/rides/${ride.id}`}
        className="flex items-center justify-between gap-2 border-b border-dashed border-line-strong bg-sage/60 px-5 py-4 sm:flex-col sm:items-start sm:justify-center sm:border-b-0 sm:border-r"
        aria-label={`Ride to ${ride.destination}, ${dayLabel(ride.date)} at ${ride.time}`}
      >
        <span className="eyebrow">{dayLabel(ride.date)}</span>
        <span className="tabular font-display text-4xl font-semibold leading-none text-forest">{ride.time}</span>
      </Link>
      <div className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <Link href={`/rides/${ride.id}`} className="block">
            <RouteLine from={ride.source} to={ride.destination} />
          </Link>
          <div className="text-right">
            <p className="tabular font-display text-2xl font-semibold">{formatInr(individualShare(ride.expectedFare, ride.totalSeats + 1))}</p>
            <p className="text-xs text-mist">each, if full</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <div className="flex items-center gap-3">
            <Avatar name={creator} userId={ride.creatorId} />
            <div>
              <p className="text-sm">
                <StudentLabel id={ride.creatorId} className="font-medium" />
              </p>
              <p className="tabular flex items-center gap-2 text-xs text-mist">
                <SeatPips total={ride.totalSeats} taken={ride.participants.length} />
                {seatsLeft(ride)} left
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {ride.status !== "PENDING" && <LifecyclePill status={ride.status} />}
            <Link href={`/rides/${ride.id}`} className="btn btn-ghost btn-sm">
              Details
            </Link>
            <RequestRideButton ride={ride} small />
          </div>
        </div>
      </div>
    </li>
  );
}
