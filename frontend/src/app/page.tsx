"use client";

import Link from "next/link";
import { useMemo, type CSSProperties } from "react";
import { ActivityBadge } from "@/components/ActivityCard";
import { ApiStatus } from "@/components/ApiStatus";
import { DepartureBoard } from "@/components/DepartureBoard";
import { ArrowIcon, CarIcon, PeopleIcon, PlusIcon } from "@/components/Icons";
import { Ready } from "@/components/Ready";
import { RouteLine } from "@/components/RouteLine";
import { SeatPips } from "@/components/SeatPips";
import { TodoPanel } from "@/components/TodoPanel";
import { dayLabel, formatInr, individualShare, sortKey } from "@/lib/format";
import { incomingRequests } from "@/lib/selectors";
import { personName, seatsLeft, spotsLeft, useStore } from "@/lib/store";

const STEPS: { name: string; text: string; planned?: boolean }[] = [
  { name: "Verify", text: "Thapar email confirmed by a one-time code." },
  { name: "Discover", text: "Search rides and activities." },
  { name: "Join", text: "Send a request; the creator approves." },
  { name: "Coordinate", text: "Plan with everyone who is in." },
  { name: "Split", text: "Actual fare ÷ participants. Rides only." },
  { name: "Pay", text: "UPI link per rider, creator confirms." },
];

function Dashboard() {
  const store = useStore();
  const { rides, activities, payments } = store;

  const openRides = useMemo(
    () =>
      rides
        .filter((r) => r.status === "PENDING" && r.creatorId !== "me" && seatsLeft(r) > 0)
        .sort((a, b) => sortKey(a.date, a.time).localeCompare(sortKey(b.date, b.time))),
    [rides],
  );
  const openActivities = useMemo(
    () =>
      activities
        .filter((a) => a.status === "UPCOMING" && a.creatorId !== "me" && spotsLeft(a) > 0)
        .sort((a, b) => sortKey(a.date, a.time).localeCompare(sortKey(b.date, b.time))),
    [activities],
  );
  const toReview = useMemo(() => incomingRequests(store).filter((r) => r.status === "PENDING" && !r.restricted), [store]);
  const owedTotal = payments.filter((p) => p.studentId === "me" && p.status === "PENDING").reduce((sum, p) => sum + p.amount, 0);

  const popular = useMemo(() => {
    const counts = new Map<string, number>();
    rides.forEach((r) => counts.set(r.destination, (counts.get(r.destination) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [rides]);

  const next = openRides[0];
  const stats = [
    { label: "Open rides", value: String(openRides.length), href: "/rides" },
    { label: "Open activities", value: String(openActivities.length), href: "/company" },
    { label: "Requests to review", value: String(toReview.length), href: "/requests" },
    { label: "You owe", value: formatInr(owedTotal), href: "/activities" },
  ];

  return (
    <div className="space-y-10">

      {/* Hero */}
      <section className="grid items-center gap-10 lg:grid-cols-[1.2fr_1fr]">
        <div className="rise">
          <p className="eyebrow mb-4">Thapar students · rides and company</p>
          <h1 className="font-display text-5xl font-semibold leading-[1.04] tracking-tight md:text-7xl">
            Find your people.
            <br />
            Share the ride.
            <br />
            <span className="italic text-forest">Split the fare.</span>
          </h1>
          <p className="mt-5 max-w-md text-lg text-mist">
            Post a ride or an activity, approve who joins, and divide the actual fare equally. CampusPool never holds your money.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/rides" className="btn btn-primary btn-lg">
              <CarIcon className="h-5 w-5" /> Find a Ride
            </Link>
            <Link href="/company" className="btn btn-ghost btn-lg">
              <PeopleIcon className="h-5 w-5" /> Find Company
            </Link>
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            <Link href="/rides/new" className="inline-flex items-center gap-1.5 font-medium text-forest underline-offset-4 hover:underline">
              <PlusIcon className="h-4 w-4" /> Offer a ride
            </Link>
            <Link href="/company/new" className="inline-flex items-center gap-1.5 font-medium text-forest underline-offset-4 hover:underline">
              <PlusIcon className="h-4 w-4" /> Post an activity
            </Link>
          </div>
        </div>

        {/* Boarding pass for the next real open ride */}
        <div className="on-forest rise relative overflow-hidden rounded-3xl bg-forest p-6 text-white shadow-[0_30px_60px_-30px_rgba(15,56,41,0.7)]" style={{ "--delay": "0.1s" } as CSSProperties}>
          <div aria-hidden="true" className="absolute -left-3 top-[62%] h-6 w-6 rounded-full bg-cream" />
          <div aria-hidden="true" className="absolute -right-3 top-[62%] h-6 w-6 rounded-full bg-cream" />
          <p className="eyebrow !text-lime">Next departure</p>
          {next ? (
            <>
              <div className="mt-3 flex items-end justify-between gap-3">
                <p className="tabular font-display text-6xl font-semibold leading-none text-lime">{next.time}</p>
                <p className="pb-1 text-sm text-white/75">{dayLabel(next.date)}</p>
              </div>
              <div className="mt-6 text-white [&_.eyebrow]:!text-white/60">
                <RouteLine from={next.source} to={next.destination} large />
              </div>
              <div className="mt-10 flex items-center justify-between border-t border-dashed border-white/30 pt-5">
                <div>
                  <p className="tabular flex items-center gap-2 text-sm text-white/80">
                    <SeatPips total={next.totalSeats} taken={next.participants.length} /> {seatsLeft(next)} left
                  </p>
                  <p className="tabular mt-1 text-sm text-white/80">
                    {formatInr(individualShare(next.expectedFare, next.totalSeats + 1))} each if full · by {personName(store, next.creatorId).split(" ")[0]}
                  </p>
                </div>
                <Link href={`/rides/${next.id}`} className="btn btn-lime btn-sm">
                  View <ArrowIcon className="h-4 w-4" />
                </Link>
              </div>
            </>
          ) : (
            <div className="py-8">
              <p className="font-display text-2xl font-semibold">No open rides yet</p>
              <p className="mt-2 text-white/75">Be the first to offer one.</p>
              <Link href="/rides/new" className="btn btn-lime mt-5">
                <PlusIcon className="h-4 w-4" /> Offer a ride
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Stats: one ruled strip rather than four cards */}
      <section aria-label="Summary" className="card grid grid-cols-2 divide-line md:grid-cols-4 md:divide-x">
        {stats.map((s, i) => (
          <Link key={s.label} href={s.href} className={`group px-5 py-5 transition-colors hover:bg-sage/60 ${i < 2 ? "border-b border-line md:border-b-0" : ""} ${i % 2 === 0 ? "border-r border-line md:border-r-0" : ""}`}>
            <p className="tabular font-display text-4xl font-semibold">{s.value}</p>
            <p className="mt-1 text-sm text-mist group-hover:text-ink">{s.label}</p>
          </Link>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <TodoPanel />
        <section className="card p-6" aria-labelledby="routes-title">
          <p className="eyebrow mb-1">Insights</p>
          <h2 id="routes-title" className="font-display text-2xl font-semibold">
            Popular routes
          </h2>
          <p className="text-sm text-mist">By number of rides posted.</p>
          <ul className="mt-5 space-y-4">
            {popular.map(([dest, n]) => (
              <li key={dest}>
                <div className="flex justify-between text-sm">
                  <span>{dest}</span>
                  <span className="tabular text-mist">{n}</span>
                </div>
                <div className="mt-1.5 h-2 rounded-full bg-sage">
                  <div className="h-2 rounded-full bg-forest" style={{ width: `${(n / popular[0][1]) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <DepartureBoard rides={openRides.slice(0, 4)} />

      <section aria-labelledby="campus-title">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <p className="eyebrow mb-1">Find company</p>
            <h2 id="campus-title" className="font-display text-2xl font-semibold">
              Happening on campus
            </h2>
          </div>
          <Link href="/company" className="text-sm font-medium text-forest underline underline-offset-4">
            See all
          </Link>
        </div>
        <ul className="grid gap-3 md:grid-cols-2">
          {openActivities.slice(0, 4).map((a) => (
            <li key={a.id}>
              <Link href={`/company/${a.id}`} className="card lift flex items-center gap-4 p-4">
                <ActivityBadge type={a.type} size="lg" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{a.title}</span>
                  <span className="block text-sm text-mist">
                    {dayLabel(a.date)}, {a.time} · {spotsLeft(a)} spots left
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="how-title" className="card p-6">
        <h2 id="how-title" className="font-display text-2xl font-semibold">
          How CampusPool works
        </h2>
        <ol className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-6">
          {STEPS.map((s, i) => (
            <li key={s.name} className="text-sm">
              <span
                className={`tabular mb-3 flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${
                  s.planned ? "border border-dashed border-line-strong text-mist" : "bg-lime text-forest-deep"
                }`}
              >
                {i + 1}
              </span>
              <p className="font-semibold">{s.name}</p>
              <p className="mt-0.5 text-mist">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <ApiStatus />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Ready>
      <Dashboard />
    </Ready>
  );
}
