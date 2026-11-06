"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PlusIcon } from "@/components/Icons";
import { PageHeader } from "@/components/PageHeader";
import { Empty, Ready } from "@/components/Ready";
import { RideCard } from "@/components/RideCard";
import { RidesMap } from "@/components/RidesMap";
import { sortKey, toISODate } from "@/lib/format";
import { seatsLeft, useStore } from "@/lib/store";

function RidePool() {
  const { rides } = useStore();
  const [query, setQuery] = useState("");
  const [day, setDay] = useState<"all" | "today" | "tomorrow">("all");
  const [seats, setSeats] = useState(1);
  const [showClosed, setShowClosed] = useState(false);
  const [view, setView] = useState<"list" | "map">("list");

  const filtered = useMemo(() => {
    const today = toISODate(new Date());
    const tomorrow = toISODate(new Date(Date.now() + 24 * 3600 * 1000));
    const q = query.trim().toLowerCase();
    return rides
      .filter((r) => (showClosed ? true : r.status === "PENDING" && seatsLeft(r) >= seats))
      .filter((r) => (day === "all" ? true : r.date === (day === "today" ? today : tomorrow)))
      .filter((r) => `${r.destination} ${r.source}`.toLowerCase().includes(q))
      .sort((a, b) => sortKey(a.date, a.time).localeCompare(sortKey(b.date, b.time)));
  }, [rides, query, day, seats, showClosed]);

  return (
    <div>
      <PageHeader
        title="Ride Pool"
        intro="Find a ride that matches your destination and time, then ask the creator for a seat."
        action={
          <Link href="/rides/new" className="btn btn-primary">
            <PlusIcon className="h-4 w-4" /> Offer a ride
          </Link>
        }
      />

      <div role="group" aria-label="View" className="mb-4 inline-flex gap-1 rounded-xl bg-sage p-1">
        {(["list", "map"] as const).map((v) => (
          <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${view === v ? "bg-paper shadow-sm" : "text-mist hover:text-ink"}`}>
            {v === "list" ? "List" : "Map"}
          </button>
        ))}
      </div>

      <div className="card mb-5 grid gap-3 p-4 md:grid-cols-[1fr_auto_auto]">
        <label>
          <span className="label">Destination or pickup</span>
          <input className="field" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. Chandigarh, railway station" />
        </label>
        <div>
          <span className="label">When</span>
          <div role="group" aria-label="Day" className="flex gap-2">
            {(["all", "today", "tomorrow"] as const).map((d) => (
              <button key={d} type="button" aria-pressed={day === d} onClick={() => setDay(d)} className={`btn btn-sm ${day === d ? "btn-primary" : "btn-ghost"}`}>
                {d === "all" ? "Any day" : d === "today" ? "Today" : "Tomorrow"}
              </button>
            ))}
          </div>
        </div>
        <label>
          <span className="label">Seats needed</span>
          <select className="field" value={seats} onChange={(e) => setSeats(Number(e.target.value))} disabled={showClosed}>
            {[1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {n} or more
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-mist md:col-span-3">
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
          Include full, completed and cancelled rides
        </label>
      </div>

      {view === "map" ? (
        <RidesMap rides={filtered} />
      ) : filtered.length === 0 ? (
        <Empty>
          No rides match. Try another destination or day, or{" "}
          <Link href="/rides/new" className="font-medium text-forest underline underline-offset-4">
            offer your own
          </Link>
          .
        </Empty>
      ) : (
        <ul className="space-y-3">
          {filtered.map((r) => (
            <RideCard key={r.id} ride={r} />
          ))}
        </ul>
      )}
      <p className="mt-4 text-xs text-mist">Showing {filtered.length} ride{filtered.length === 1 ? "" : "s"}. Earliest first.</p>
    </div>
  );
}

export default function RidesPage() {
  return (
    <Ready>
      <RidePool />
    </Ready>
  );
}
