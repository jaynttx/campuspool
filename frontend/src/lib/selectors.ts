import type { RequestStatus, Snapshot } from "@/data/types";

export type RequestItem = {
  kind: "ride" | "activity";
  id: string; // request id
  requesterId: string;
  ownerId: string; // creator of the ride or activity
  requestedOn: number;
  targetId: string;
  title: string;
  when: string; // "YYYY-MM-DD HH:MM" for display
  status: RequestStatus;
  restricted: boolean; // the ride or activity owner restricted this requester: no notifications
};

type Slice = Pick<Snapshot, "rides" | "rideRequests" | "activities" | "activityRequests">;

function allRequests(s: Slice): RequestItem[] {
  const out: RequestItem[] = [];
  for (const q of s.rideRequests) {
    const r = s.rides.find((x) => x.id === q.rideId);
    if (r) out.push({ kind: "ride", id: q.id, requesterId: q.requesterId, ownerId: r.creatorId, requestedOn: q.requestedOn, targetId: r.id, title: `Ride to ${r.destination}`, when: `${r.date} ${r.time}`, status: q.status, restricted: q.restricted ?? false });
  }
  for (const q of s.activityRequests) {
    const a = s.activities.find((x) => x.id === q.activityId);
    if (a) out.push({ kind: "activity", id: q.id, requesterId: q.requesterId, ownerId: a.creatorId, requestedOn: q.requestedOn, targetId: a.id, title: a.title, when: `${a.date} ${a.time}`, status: q.status, restricted: q.restricted ?? false });
  }
  return out.sort((x, y) => y.requestedOn - x.requestedOn);
}

/** Requests other students sent to my rides and activities. */
export const incomingRequests = (s: Slice) => allRequests(s).filter((r) => r.ownerId === "me" && r.requesterId !== "me");

/** Requests I sent to other students' rides and activities. */
export const sentRequests = (s: Slice) => allRequests(s).filter((r) => r.requesterId === "me");
