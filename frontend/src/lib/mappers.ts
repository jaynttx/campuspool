import type { Activity, ActivityRequest, AppNotification, Payment, Person, Profile, RelPerson, Report, Ride, RideRequest, Settings, Snapshot } from "@/data/types";
import { absoluteUrl } from "./api";
import { toISODate, toTime } from "./format";
import { DEFAULT_SETTINGS } from "./settings";

type PersonDto = Omit<Person, "avatarUrl"> & { avatarUrl: string | null };
type MeDto = Omit<Profile, "avatarUrl"> & { avatarUrl: string | null; settings: Settings };
type RideDto = Omit<Ride, "date" | "time"> & { departsAt: string };
type ActivityDto = Omit<Activity, "date" | "time"> & { startsAt: string };

export type BootstrapDto = {
  me: MeDto;
  people: PersonDto[];
  rides: RideDto[];
  rideRequests: RideRequest[];
  payments: Payment[];
  activities: ActivityDto[];
  activityRequests: ActivityRequest[];
  notifications: AppNotification[];
  reports: Report[];
  chatUnread: number;
  myRatings: Snapshot["myRatings"];
  receivedRatings: Snapshot["receivedRatings"];
  relations: { blocked: (Omit<RelPerson, "avatarUrl"> & { avatarUrl: string | null })[]; restricted: (Omit<RelPerson, "avatarUrl"> & { avatarUrl: string | null })[] };
};

/** The server speaks in UTC timestamps; pages show local date and time. */
export function mapBootstrap(d: BootstrapDto): { snapshot: Snapshot; chatUnread: number } {
  const { settings, ...me } = d.me;
  const rides: Ride[] = d.rides.map(({ departsAt, ...r }) => {
    const when = new Date(departsAt);
    return { ...r, date: toISODate(when), time: toTime(when), note: r.note ?? undefined, actualFare: r.actualFare ?? undefined };
  });
  const activities: Activity[] = d.activities.map(({ startsAt, ...a }) => {
    const when = new Date(startsAt);
    return { ...a, date: toISODate(when), time: toTime(when) };
  });
  return {
    chatUnread: d.chatUnread,
    snapshot: {
      me: { ...me, avatarUrl: absoluteUrl(me.avatarUrl) },
      people: d.people.map((p) => ({ ...p, avatarUrl: absoluteUrl(p.avatarUrl) })),
      rides,
      rideRequests: d.rideRequests,
      payments: d.payments,
      activities,
      activityRequests: d.activityRequests,
      notifications: d.notifications,
      reports: d.reports,
      settings: { ...DEFAULT_SETTINGS, ...settings },
      myRatings: d.myRatings,
      receivedRatings: d.receivedRatings,
      relations: {
        blocked: d.relations.blocked.map((p) => ({ ...p, avatarUrl: absoluteUrl(p.avatarUrl) })),
        restricted: d.relations.restricted.map((p) => ({ ...p, avatarUrl: absoluteUrl(p.avatarUrl) })),
      },
    },
  };
}
