"use client";

import { activityRelation, rideRelation, useStore } from "@/lib/store";
import type { Activity, Ride } from "@/data/types";

const LABEL: Record<string, string> = {
  mine: "Your post",
  joined: "You are in",
  requested: "Request sent",
  full: "Full",
  closed: "Closed",
};

export function RequestRideButton({ ride, small = false }: { ride: Ride; small?: boolean }) {
  const store = useStore();
  const rel = rideRelation(store, ride);
  const size = small ? "btn-sm" : "";
  if (rel !== "open") {
    return (
      <button type="button" disabled className={`btn btn-ghost ${size}`}>
        {LABEL[rel]}
      </button>
    );
  }
  return (
    <button type="button" className={`btn btn-primary ${size}`} onClick={() => store.actions.requestJoinRide(ride.id)}>
      Request a seat
    </button>
  );
}

export function RequestActivityButton({ activity, small = false }: { activity: Activity; small?: boolean }) {
  const store = useStore();
  const rel = activityRelation(store, activity);
  const size = small ? "btn-sm" : "";
  if (rel !== "open") {
    return (
      <button type="button" disabled className={`btn btn-ghost ${size}`}>
        {LABEL[rel]}
      </button>
    );
  }
  return (
    <button type="button" className={`btn btn-primary ${size}`} onClick={() => store.actions.requestJoinActivity(activity.id)}>
      Ask to join
    </button>
  );
}
