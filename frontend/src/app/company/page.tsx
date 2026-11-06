"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ACTIVITY_LABEL, ACTIVITY_TYPES, ActivityCard } from "@/components/ActivityCard";
import { PlusIcon } from "@/components/Icons";
import { PageHeader } from "@/components/PageHeader";
import { Empty, Ready } from "@/components/Ready";
import { sortKey, toISODate } from "@/lib/format";
import { spotsLeft, useStore } from "@/lib/store";
import type { ActivityType } from "@/data/types";

function Company() {
  const { activities } = useStore();
  const [type, setType] = useState<ActivityType | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const [day, setDay] = useState<"all" | "today" | "tomorrow">("all");
  const [showClosed, setShowClosed] = useState(false);

  const filtered = useMemo(() => {
    const today = toISODate(new Date());
    const tomorrow = toISODate(new Date(Date.now() + 24 * 3600 * 1000));
    const q = query.trim().toLowerCase();
    return activities
      .filter((a) => (showClosed ? true : a.status === "UPCOMING" && spotsLeft(a) > 0))
      .filter((a) => type === "ALL" || a.type === type)
      .filter((a) => (day === "all" ? true : a.date === (day === "today" ? today : tomorrow)))
      .filter((a) => `${a.title} ${a.location} ${a.description}`.toLowerCase().includes(q))
      .sort((a, b) => sortKey(a.date, a.time).localeCompare(sortKey(b.date, b.time)));
  }, [activities, type, query, day, showClosed]);

  return (
    <div>
      <PageHeader
        title="Find Company"
        intro="Join other students for sports, study sessions, food and more. Activities have no payment step."
        action={
          <Link href="/company/new" className="btn btn-primary">
            <PlusIcon className="h-4 w-4" /> Post an activity
          </Link>
        }
      />

      <div className="card mb-5 space-y-4 p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <label>
            <span className="label">Search</span>
            <input className="field" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. badminton, library" />
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
        </div>
        <div role="group" aria-label="Activity type" className="flex flex-wrap gap-2">
          {(["ALL", ...ACTIVITY_TYPES] as const).map((t) => (
            <button key={t} type="button" aria-pressed={type === t} onClick={() => setType(t)} className={`btn btn-sm ${type === t ? "btn-primary" : "btn-ghost"}`}>
              {t === "ALL" ? "All types" : ACTIVITY_LABEL[t]}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-mist">
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
          Include full, completed and cancelled activities
        </label>
      </div>

      {filtered.length === 0 ? (
        <Empty>
          Nothing matches. Try another type or day, or{" "}
          <Link href="/company/new" className="font-medium text-forest underline underline-offset-4">
            post your own
          </Link>
          .
        </Empty>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {filtered.map((a) => (
            <ActivityCard key={a.id} activity={a} />
          ))}
        </ul>
      )}
    </div>
  );
}

export default function CompanyPage() {
  return (
    <Ready>
      <Company />
    </Ready>
  );
}
