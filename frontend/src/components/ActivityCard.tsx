"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";
import { dayLabel } from "@/lib/format";
import type { Activity, ActivityType } from "@/data/types";
import { BookIcon, CoffeeIcon, DumbbellIcon, FilmIcon, FootprintsIcon, SparklesIcon, TrophyIcon, UtensilsIcon } from "./Icons";
import { RequestActivityButton } from "./RequestSeatButton";
import { StudentLabel } from "./StudentLabel";
import { LifecyclePill } from "./StatusPill";

export const ACTIVITY_LABEL: Record<ActivityType, string> = {
  SPORTS: "Sports",
  WALK: "Walk",
  GYM: "Gym",
  FOOD: "Food",
  MOVIE: "Movie",
  STUDY: "Study",
  HANGOUT: "Hangout",
  OTHER: "Other",
};

export const ACTIVITY_TYPES = Object.keys(ACTIVITY_LABEL) as ActivityType[];

/** Each type gets its own icon and hue so activities are recognisable at a glance. The hue is mixed per theme in globals.css (.tint). */
export const ACTIVITY_STYLE: Record<ActivityType, { Icon: LucideIcon; hue: string }> = {
  SPORTS: { Icon: TrophyIcon, hue: "#6fa800" },
  WALK: { Icon: FootprintsIcon, hue: "#0f9d6e" },
  GYM: { Icon: DumbbellIcon, hue: "#e0592a" },
  FOOD: { Icon: UtensilsIcon, hue: "#e89a00" },
  MOVIE: { Icon: FilmIcon, hue: "#a24bd8" },
  STUDY: { Icon: BookIcon, hue: "#2b86d9" },
  HANGOUT: { Icon: CoffeeIcon, hue: "#e0457b" },
  OTHER: { Icon: SparklesIcon, hue: "#6b7d73" },
};

const hueStyle = (hue: string) => ({ "--hue": hue }) as CSSProperties;

export function ActivityBadge({ type, size = "md" }: { type: ActivityType; size?: "md" | "lg" }) {
  const { Icon, hue } = ACTIVITY_STYLE[type];
  const box = size === "lg" ? "h-12 w-12 rounded-2xl" : "h-9 w-9 rounded-xl";
  return (
    <span className={`tint inline-flex shrink-0 items-center justify-center ${box}`} style={hueStyle(hue)} title={ACTIVITY_LABEL[type]}>
      <Icon className={size === "lg" ? "h-6 w-6" : "h-[18px] w-[18px]"} aria-hidden="true" />
    </span>
  );
}

export function ActivityCard({ activity }: { activity: Activity }) {
  const { hue } = ACTIVITY_STYLE[activity.type];
  return (
    <li className="card lift flex flex-col justify-between p-5">
      <div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <ActivityBadge type={activity.type} />
            <span className="tint-text text-sm font-semibold" style={hueStyle(hue)}>
              {ACTIVITY_LABEL[activity.type]}
            </span>
          </div>
          {activity.status !== "UPCOMING" && <LifecyclePill status={activity.status} />}
        </div>
        <Link href={`/company/${activity.id}`} className="mt-4 block font-display text-xl font-semibold leading-snug hover:underline">
          {activity.title}
        </Link>
        <p className="mt-1 text-sm text-mist">
          {dayLabel(activity.date)}, {activity.time} · {activity.location}
        </p>
        <p className="text-sm text-mist">Hosted by <StudentLabel id={activity.creatorId} /></p>
      </div>
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4">
        <p className="tabular text-sm text-mist">
          {activity.participants.length + 1} of {activity.maxParticipants} going
        </p>
        <div className="flex gap-2">
          <Link href={`/company/${activity.id}`} className="btn btn-ghost btn-sm">
            Details
          </Link>
          <RequestActivityButton activity={activity} small />
        </div>
      </div>
    </li>
  );
}
