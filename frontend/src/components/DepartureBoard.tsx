"use client";

import Link from "next/link";
import { dayLabel, formatInr, individualShare } from "@/lib/format";
import { personName, seatsLeft, useStore } from "@/lib/store";
import type { Ride } from "@/data/types";
import { ArrowIcon } from "./Icons";

/** Open rides listed like a station departure board. Each row opens the ride. */
export function DepartureBoard({ rides }: { rides: Ride[] }) {
  const store = useStore();
  return (
    <section className="on-forest overflow-hidden rounded-3xl bg-forest text-white" aria-labelledby="board-title">
      <div className="flex items-end justify-between gap-4 px-6 pb-4 pt-6">
        <div>
          <p className="eyebrow !text-lime">Departures</p>
          <h2 id="board-title" className="font-display text-2xl font-semibold">
            Leaving soon
          </h2>
        </div>
        <Link href="/rides" className="inline-flex items-center gap-1.5 text-sm font-medium text-lime underline-offset-4 hover:underline">
          All rides <ArrowIcon className="h-4 w-4" />
        </Link>
      </div>
      {rides.length === 0 ? (
        <p className="px-6 pb-6 text-white/75">No open rides right now. Offer one and be the first.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left">
            <caption className="sr-only">Open rides leaving from Thapar</caption>
            <thead className="text-xs text-white/65">
              <tr>
                <th scope="col" className="px-6 py-2 font-medium">Time</th>
                <th scope="col" className="px-2 py-2 font-medium">Going to</th>
                <th scope="col" className="px-2 py-2 font-medium">Seats left</th>
                <th scope="col" className="px-6 py-2 text-right font-medium">Each, if full</th>
              </tr>
            </thead>
            <tbody>
              {rides.map((r) => (
                <tr key={r.id} className="border-t border-white/15 transition-colors hover:bg-white/10">
                  <td className="tabular px-6 py-4">
                    <Link href={`/rides/${r.id}`} className="block">
                      <span className="font-display text-2xl font-semibold text-lime">{r.time}</span>
                      <span className="ml-2 text-xs text-white/70">{dayLabel(r.date)}</span>
                    </Link>
                  </td>
                  <td className="px-2 py-4">
                    <Link href={`/rides/${r.id}`} className="block">
                      <span className="font-medium">{r.destination}</span>
                      <span className="block text-xs text-white/70">
                        from {r.source} · {r.creatorId === "me" ? "you" : personName(store, r.creatorId)}
                      </span>
                    </Link>
                  </td>
                  <td className="tabular px-2 py-4">
                    {seatsLeft(r)} of {r.totalSeats}
                  </td>
                  <td className="tabular px-6 py-4 text-right">{formatInr(individualShare(r.expectedFare, r.totalSeats + 1))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
