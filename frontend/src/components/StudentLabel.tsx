"use client";

import { personName, useStore } from "@/lib/store";

export function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10 > 3 ? 0 : n % 10] ?? "th"}`;
}

/** A student's name with their year, when they allow it to be shown. */
export function StudentLabel({ id, className }: { id: string; className?: string }) {
  const store = useStore();
  const name = id === "me" ? "You" : personName(store, id);
  const person = id === "me" ? store.me : store.people.find((p) => p.id === id);
  const year = person?.year;
  const avg = person?.ratingAvg;
  const count = person?.ratingCount ?? 0;
  return (
    <span className={className}>
      {name}
      {year ? <span className="font-normal text-mist"> · {ordinal(year)} year</span> : null}
      {avg && count > 0 ? (
        <span className="font-normal text-mist" title={`${avg} out of 5 from ${count} rating${count === 1 ? "" : "s"}`}>
          {" "}
          · ★ {avg.toFixed(1)} ({count})
        </span>
      ) : null}
    </span>
  );
}
