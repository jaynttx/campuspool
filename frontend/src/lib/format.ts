export const formatInr = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);

/** Core rule from the report: Individual Share = Actual Fare / Number of Participants. */
export const individualShare = (actualFare: number, participants: number): number =>
  Math.round((actualFare / Math.max(1, participants)) * 100) / 100;

const pad = (n: number) => String(n).padStart(2, "0");

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function dayLabel(iso: string, now: Date = new Date()): string {
  const today = toISODate(now);
  const tomorrow = toISODate(new Date(now.getTime() + 24 * 3600 * 1000));
  const yesterday = toISODate(new Date(now.getTime() - 24 * 3600 * 1000));
  if (iso === today) return "Today";
  if (iso === tomorrow) return "Tomorrow";
  if (iso === yesterday) return "Yesterday";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

export function timeAgo(ts: number, now: number = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

export const sortKey = (date: string, time: string) => `${date}T${time}`;

export const isPast = (date: string, time: string) => new Date(`${date}T${time}`).getTime() < Date.now();
