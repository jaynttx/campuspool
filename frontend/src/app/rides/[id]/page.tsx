"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import { CheckIcon, CloseIcon } from "@/components/Icons";
import { PaymentPanel } from "@/components/PaymentPanel";
import { RatePanel } from "@/components/RatePanel";
import { RouteMap } from "@/components/RouteMap";
import { hasPoint } from "@/lib/geo";
import { Ready } from "@/components/Ready";
import { ReportBox } from "@/components/ReportBox";
import { RequestRideButton } from "@/components/RequestSeatButton";
import { RouteLine } from "@/components/RouteLine";
import { SeatPips } from "@/components/SeatPips";
import { MessageButton } from "@/components/MessageButton";
import { StudentLabel } from "@/components/StudentLabel";
import { StudentActions } from "@/components/StudentActions";
import { LifecyclePill, StatusPill } from "@/components/StatusPill";
import { dayLabel, formatInr, individualShare, timeAgo } from "@/lib/format";
import { personName, rideHeadcount, seatsLeft, useStore } from "@/lib/store";

function RideDetail({ id }: { id: string }) {
  const store = useStore();
  const { actions } = store;
  const router = useRouter();
  const ride = store.rides.find((r) => r.id === id);
  const [fare, setFare] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmSeries, setConfirmSeries] = useState(false);

  if (!ride) {
    return (
      <div className="card p-8 text-center">
        <p className="text-lg font-semibold">Ride not found</p>
        <p className="mt-1 text-mist">It may have been removed. Browse the Ride Pool for current rides.</p>
        <Link href="/rides" className="btn btn-primary mt-4">
          Back to Ride Pool
        </Link>
      </div>
    );
  }

  const mine = ride.creatorId === "me";
  const creator = personName(store, ride.creatorId);
  const requests = store.rideRequests.filter((q) => q.rideId === ride.id);
  const pending = requests.filter((q) => q.status === "PENDING");
  const decided = requests.filter((q) => q.status !== "PENDING");
  const fareNum = Number(fare);
  const fareValid = fare !== "" && Number.isFinite(fareNum) && fareNum > 0;
  const open = ride.status === "PENDING";
  const unsettled = store.payments.some((p) => p.rideId === ride.id && p.status === "PENDING");
  const owes = store.payments.some((p) => p.rideId === ride.id && p.studentId === "me" && p.status === "PENDING");
  const myRequest = requests.find((q) => q.requesterId === "me");

  return (
    <div className="space-y-6">
      <Link href="/rides" className="text-sm text-mist underline underline-offset-4">
        Ride Pool
      </Link>

      <section className="card overflow-hidden">
        <div className="grid md:grid-cols-[1fr_220px]">
          <div className="p-6">
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <LifecyclePill status={ride.status} />
              {mine && <span className="text-xs text-mist">Your ride</span>}
              {ride.seriesId && <span className="rounded-full border border-line bg-sage px-2.5 py-0.5 text-xs font-medium">Repeating ride</span>}
            </div>
            <h1 className="sr-only">Ride to {ride.destination}</h1>
            <RouteLine from={ride.source} to={ride.destination} large />
            {ride.note && <p className="mt-5 rounded-xl bg-sage px-4 py-3 text-sm">{ride.note}</p>}
            {!mine && (
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <RequestRideButton ride={ride} />
                {(myRequest?.status === "PENDING" || ride.participants.includes("me")) && <MessageButton userId={ride.creatorId} label={`Message ${creator.split(" ")[0]}`} small={false} />}
                {myRequest && (
                  <span className="flex items-center gap-2 text-sm text-mist">
                    Your request: <StatusPill status={myRequest.status} /> sent {timeAgo(myRequest.requestedOn)}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-col justify-center gap-1 border-t border-dashed border-line-strong bg-sage/60 p-6 md:border-l md:border-t-0">
            <p className="eyebrow">Departs</p>
            <p className="tabular font-display text-5xl font-semibold leading-none text-forest">{ride.time}</p>
            <p className="text-sm text-mist">{dayLabel(ride.date)}</p>
            <p className="mt-4 flex items-center gap-2 text-sm">
              <SeatPips total={ride.totalSeats} taken={ride.participants.length} />
              <span className="tabular">{seatsLeft(ride)} left</span>
            </p>
          </div>
        </div>
      </section>

      {hasPoint(ride.srcLat, ride.srcLng) && hasPoint(ride.dstLat, ride.dstLng) && (
        <section className="card p-4" aria-label="Route map">
          <RouteMap from={{ lat: ride.srcLat as number, lng: ride.srcLng as number }} to={{ lat: ride.dstLat as number, lng: ride.dstLng as number }} label={`Map of the route from ${ride.source} to ${ride.destination}`} />
        </section>
      )}

      <section className="card p-6" aria-labelledby="fare-title">
        <h2 id="fare-title" className="font-display text-2xl font-semibold">
          Fare breakdown
        </h2>
        <dl className="mt-4 divide-y divide-line text-sm">
          <div className="flex justify-between py-2.5">
            <dt className="text-mist">Expected total fare</dt>
            <dd className="tabular font-medium">{formatInr(ride.expectedFare)}</dd>
          </div>
          <div className="flex justify-between py-2.5">
            <dt className="text-mist">People in the ride now (incl. creator)</dt>
            <dd className="tabular font-medium">{rideHeadcount(ride)}</dd>
          </div>
          <div className="flex justify-between py-2.5">
            <dt className="text-mist">Each pays at the current headcount</dt>
            <dd className="tabular font-medium">{formatInr(individualShare(ride.expectedFare, rideHeadcount(ride)))}</dd>
          </div>
          <div className="flex justify-between py-2.5">
            <dt className="text-mist">Each pays if all {ride.totalSeats} seats fill</dt>
            <dd className="tabular font-semibold text-forest">{formatInr(individualShare(ride.expectedFare, ride.totalSeats + 1))}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-mist">
          These are estimates. The real split uses the actual fare the creator enters when the ride is complete: actual fare ÷ number of participants.
        </p>
      </section>

      <section className="card p-5">
        <h2 className="mb-3 font-display text-2xl font-semibold">Who is going ({rideHeadcount(ride)})</h2>
        <ul className="space-y-3">
          <li className="flex items-center gap-3">
            <Avatar name={creator} userId={ride.creatorId} />
            <StudentLabel id={ride.creatorId} className="font-medium" />
            <span className="text-xs text-mist">creator</span>
            {!mine && <StudentActions userId={ride.creatorId} name={creator} />}
          </li>
          {ride.participants.map((pid) => (
            <li key={pid} className="flex items-center gap-3">
              <Avatar userId={pid} name={personName(store, pid)} />
              <StudentLabel id={pid} className="font-medium" />
              {pid !== "me" && <StudentActions userId={pid} name={personName(store, pid)} />}
            </li>
          ))}
        </ul>
      </section>

      {mine && (
        <section className="card space-y-5 p-5">
          <h2 className="font-display text-2xl font-semibold">Requests to join ({pending.length} waiting)</h2>
          {pending.length === 0 ? (
            <p className="text-mist">No pending requests.</p>
          ) : (
            <ul className="divide-y divide-line">
              {pending.map((q) => (
                <li key={q.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar userId={q.requesterId} name={personName(store, q.requesterId)} />
                    <div>
                      <p>
                        <StudentLabel id={q.requesterId} className="font-medium" />
                      </p>
                      <p className="text-xs text-mist">Asked {timeAgo(q.requestedOn)}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <MessageButton userId={q.requesterId} />
                    <button type="button" className="btn btn-good btn-sm" disabled={seatsLeft(ride) <= 0 || !open} onClick={() => actions.decideRideRequest(q.id, true)}>
                      <CheckIcon className="h-4 w-4" /> Accept
                    </button>
                    <button type="button" className="btn btn-bad btn-sm" disabled={!open} onClick={() => actions.decideRideRequest(q.id, false)}>
                      <CloseIcon className="h-4 w-4" /> Decline
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {decided.length > 0 && (
            <ul className="space-y-1 text-sm text-mist">
              {decided.map((q) => (
                <li key={q.id} className="flex items-center gap-2">
                  <StudentLabel id={q.requesterId} /> <StatusPill status={q.status} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {mine && (open || ride.status === "ONGOING") && (
        <section className="card space-y-4 p-5">
          <h2 className="font-display text-2xl font-semibold">Run this ride</h2>
          {open && (
            <button type="button" className="btn btn-ghost" onClick={() => actions.startRide(ride.id)}>
              Mark ride as started
            </button>
          )}
          <div>
            <label>
              <span className="label">Ride finished? Enter the actual fare (₹)</span>
              <input className="field tabular max-w-xs" inputMode="decimal" value={fare} onChange={(e) => setFare(e.target.value)} placeholder="e.g. 600" />
            </label>
            {fareValid && (
              <p className="tabular mt-2 text-sm">
                {formatInr(fareNum)} ÷ {rideHeadcount(ride)} ={" "}
                <span className="font-semibold text-verified">{formatInr(individualShare(fareNum, rideHeadcount(ride)))}</span> each
              </p>
            )}
            <button type="button" className="btn btn-primary mt-3" disabled={!fareValid} onClick={() => actions.completeRide(ride.id, fareNum)}>
              Complete ride and split fare
            </button>
          </div>
          <div className="border-t border-line pt-4">
            {!confirmCancel ? (
              <button type="button" className="btn btn-bad btn-sm" onClick={() => setConfirmCancel(true)}>
                Cancel this ride
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm">Cancel the ride and decline pending requests?</span>
                <button type="button" className="btn btn-bad btn-sm" onClick={() => actions.cancelRide(ride.id)}>
                  Yes, cancel
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmCancel(false)}>
                  Keep ride
                </button>
              </div>
            )}
            {ride.seriesId && (
              <div className="mt-3">
                {!confirmSeries ? (
                  <button type="button" className="btn btn-bad btn-sm" onClick={() => setConfirmSeries(true)}>
                    Cancel this and all later rides in the series
                  </button>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm">Cancel this ride and every later open ride in the series? Riders are told.</span>
                    <button type="button" className="btn btn-bad btn-sm" onClick={() => actions.cancelSeries(ride.id)}>
                      Yes, cancel them
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmSeries(false)}>
                      Keep them
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {ride.status === "COMPLETED" && <PaymentPanel ride={ride} />}
      {ride.status === "COMPLETED" && (mine || ride.participants.includes("me")) && <RatePanel ride={ride} />}

      {(ride.status === "COMPLETED" || ride.status === "CANCELLED") && (mine || ride.participants.includes("me") || myRequest) && (
        <section className="card p-5" aria-labelledby="tidy-title">
          <h2 id="tidy-title" className="font-display text-2xl font-semibold">
            Tidy up
          </h2>
          {mine ? (
            <>
              <p className="mt-1 text-sm text-mist">
                {unsettled
                  ? "Confirm every rider's payment first. Removing the ride would erase the record of who owes what."
                  : "Everyone is settled. Remove this ride now, or it disappears by itself about a day after the last payment is confirmed."}
              </p>
              <button
                type="button"
                className="btn btn-bad mt-3"
                disabled={unsettled}
                onClick={async () => {
                  const r = await actions.removeRide(ride.id);
                  if (r.ok) router.push("/activities");
                }}
              >
                Remove ride
              </button>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm text-mist">{owes ? "Pay your share first, then you can remove this ride from your lists." : "Remove it from your lists. Other people still see it."}</p>
              <button
                type="button"
                className="btn btn-ghost mt-3"
                disabled={owes}
                onClick={async () => {
                  const r = await actions.hideItem("ride", ride.id);
                  if (r.ok) router.push("/activities");
                }}
              >
                Remove from my list
              </button>
            </>
          )}
        </section>
      )}

      {!mine && <ReportBox kind="ride" targetId={ride.id} />}
    </div>
  );
}

export default function RideDetailPage() {
  const params = useParams<{ id: string }>();
  return (
    <Ready>
      <RideDetail id={params.id} />
    </Ready>
  );
}
