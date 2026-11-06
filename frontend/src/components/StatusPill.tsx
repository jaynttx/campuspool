import type { ReactNode } from "react";
import type { ActivityStatus, PaymentStatus, RequestStatus, RideStatus } from "@/data/types";

type Tone = "ok" | "warn" | "bad" | "info" | "mute";
const TONES: Record<Tone, string> = {
  ok: "bg-ok-bg text-verified border-ok-line",
  warn: "bg-warn-bg text-signal border-warn-line",
  bad: "bg-bad-bg text-alert border-bad-line",
  info: "bg-lime/50 text-forest-deep border-lime dark:text-lime dark:bg-lime/10 dark:border-lime/40",
  mute: "bg-sage text-mist border-line",
};

export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]}`}>{children}</span>;
}

export function StatusPill({ status }: { status: RequestStatus }) {
  const map: Record<RequestStatus, [Tone, string]> = { PENDING: ["warn", "Pending"], ACCEPTED: ["ok", "Accepted"], REJECTED: ["bad", "Declined"] };
  return <Pill tone={map[status][0]}>{map[status][1]}</Pill>;
}

export function LifecyclePill({ status }: { status: RideStatus | ActivityStatus }) {
  const map: Record<RideStatus | ActivityStatus, [Tone, string]> = {
    PENDING: ["info", "Open"],
    UPCOMING: ["info", "Open"],
    ONGOING: ["warn", "In progress"],
    COMPLETED: ["ok", "Completed"],
    CANCELLED: ["bad", "Cancelled"],
  };
  return <Pill tone={map[status][0]}>{map[status][1]}</Pill>;
}

export function PaymentPill({ status, riderMarkedPaid }: { status: PaymentStatus; riderMarkedPaid: boolean }) {
  if (status === "SUCCESS") return <Pill tone="ok">Confirmed by creator</Pill>;
  if (status === "FAILED") return <Pill tone="bad">Failed</Pill>;
  if (status === "REFUNDED") return <Pill tone="mute">Refunded</Pill>;
  return riderMarkedPaid ? <Pill tone="info">Rider says paid</Pill> : <Pill tone="warn">Unpaid</Pill>;
}
