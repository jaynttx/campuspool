"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { FormField, FormSection } from "@/components/FormField";
import { PageHeader } from "@/components/PageHeader";
import { Ready } from "@/components/Ready";
import { RouteMap } from "@/components/RouteMap";
import { PLACES, findPlace } from "@/data/places";
import { dayLabel, formatInr, individualShare, isPast, toISODate, toTime } from "@/lib/format";
import type { LatLng } from "@/lib/geo";
import { useStore } from "@/lib/store";

type Errors = Partial<Record<"source" | "destination" | "when" | "fare" | "map" | "repeat", string>>;
type Repeat = "none" | "weekly" | "weekdays";

/** Departures after the first one, in local time. */
function buildRepeats(date: string, time: string, mode: Repeat, total: number): { date: string; time: string }[] {
  if (mode === "none" || !date || !time) return [];
  const out: { date: string; time: string }[] = [];
  const start = new Date(`${date}T${time}`);
  if (mode === "weekly") {
    for (let i = 1; i < total; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + 7 * i);
      out.push({ date: toISODate(d), time });
    }
    return out;
  }
  const d = new Date(start);
  while (out.length < total - 1) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) out.push({ date: toISODate(d), time });
  }
  return out;
}

function NewRideForm() {
  const router = useRouter();
  const { actions, settings } = useStore();
  const later = new Date(Date.now() + 2 * 3600 * 1000);
  const [source, setSource] = useState(settings.defaultPickup);
  const [destination, setDestination] = useState("");
  const [from, setFrom] = useState<LatLng | null>(() => {
    const p = findPlace(settings.defaultPickup);
    return p ? { lat: p.lat, lng: p.lng } : null;
  });
  const [to, setTo] = useState<LatLng | null>(null);
  const [date, setDate] = useState(toISODate(later));
  const [time, setTime] = useState(toTime(later));
  const [repeat, setRepeat] = useState<Repeat>("none");
  const [total, setTotal] = useState(4);
  const [seats, setSeats] = useState(settings.defaultSeats);
  const [fare, setFare] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  const fareNum = Number(fare);
  const fareValid = fare.trim() !== "" && Number.isFinite(fareNum) && fareNum > 0;
  const repeats = useMemo(() => buildRepeats(date, time, repeat, total), [date, time, repeat, total]);

  function validate(): Errors {
    const e: Errors = {};
    if (!source.trim()) e.source = "Add a pickup point so riders know where to meet.";
    if (!destination.trim()) e.destination = "Add a destination.";
    if (!date || !time) e.when = "Pick a date and a time.";
    else if (isPast(date, time)) e.when = "That time has already passed. Pick a later time.";
    if (!fareValid) e.fare = "Enter the expected total fare in rupees, for example 600.";
    if ((from && !to) || (!from && to)) e.map = "Place both pins on the map, or clear the map.";
    if (repeat !== "none") {
      if (!Number.isInteger(total) || total < 2 || total > 12) e.repeat = "Choose between 2 and 12 rides in total.";
      else if (repeats.length > 0 && new Date(`${repeats[repeats.length - 1].date}T${time}`).getTime() - Date.now() > 60 * 86400000) e.repeat = "Rides can be posted up to 60 days ahead. Use fewer rides.";
    }
    return e;
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0 || busy) return;
    setBusy(true);
    const res = await actions.createRide({
      source: source.trim(),
      destination: destination.trim(),
      date,
      time,
      totalSeats: seats,
      expectedFare: fareNum,
      note: note.trim() || undefined,
      srcLat: from?.lat ?? null,
      srcLng: from?.lng ?? null,
      dstLat: to?.lat ?? null,
      dstLng: to?.lng ?? null,
      repeatAt: repeats,
    });
    setBusy(false);
    if (res.ok && res.id) router.push(`/rides/${res.id}`);
  }

  const touch = () => setErrors(validate());

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow="Ride Pool" title="Offer a ride" intro="Post where you are going and how many seats are free. Students send requests and you decide who joins." />
      <form onSubmit={submit} className="card space-y-6 p-6 md:p-8" noValidate>
        <FormSection step={1} title="Route">
          <datalist id="places">
            {PLACES.map((p) => (
              <option key={p.name} value={p.name} />
            ))}
          </datalist>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="source" label="Pickup point" error={errors.source}>
              <input
                id="source"
                list="places"
                className="field"
                value={source}
                onChange={(e) => {
                  setSource(e.target.value);
                  const p = findPlace(e.target.value);
                  if (p) setFrom({ lat: p.lat, lng: p.lng });
                }}
                onBlur={touch}
                aria-invalid={!!errors.source}
                aria-describedby={errors.source ? "source-error" : undefined}
              />
            </FormField>
            <FormField id="destination" label="Destination" error={errors.destination}>
              <input
                id="destination"
                list="places"
                className="field"
                value={destination}
                onChange={(e) => {
                  setDestination(e.target.value);
                  const p = findPlace(e.target.value);
                  if (p) setTo({ lat: p.lat, lng: p.lng });
                }}
                onBlur={touch}
                placeholder="e.g. Chandigarh ISBT 43"
                aria-invalid={!!errors.destination}
                aria-describedby={errors.destination ? "destination-error" : undefined}
              />
            </FormField>
          </div>
          <RouteMap
            from={from}
            to={to}
            editable
            onChange={(f, t) => {
              setFrom(f);
              setTo(t);
            }}
            label="Map for choosing the pickup and destination"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => (setFrom(null), setTo(null))} disabled={!from && !to}>
              Clear map points
            </button>
            <p className="text-xs text-mist">Map points are optional. They let riders see the route. Pick a known place above, or click the map.</p>
          </div>
          {errors.map && (
            <p role="alert" className="error-text">
              {errors.map}
            </p>
          )}
        </FormSection>

        <FormSection step={2} title="Departure">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="date" label="Date" error={errors.when}>
              <input id="date" className="field" type="date" value={date} min={toISODate(new Date())} onChange={(e) => setDate(e.target.value)} onBlur={touch} aria-invalid={!!errors.when} aria-describedby={errors.when ? "date-error" : undefined} />
            </FormField>
            <FormField id="time" label="Time">
              <input id="time" className="field" type="time" value={time} onChange={(e) => setTime(e.target.value)} onBlur={touch} aria-invalid={!!errors.when} />
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="repeat" label="Repeat" hint="Each date becomes its own ride with its own seats and requests.">
              <select id="repeat" className="field" value={repeat} onChange={(e) => setRepeat(e.target.value as Repeat)}>
                <option value="none">Does not repeat</option>
                <option value="weekly">Every week, same day</option>
                <option value="weekdays">Every weekday (Mon to Fri)</option>
              </select>
            </FormField>
            {repeat !== "none" && (
              <FormField id="total" label="Number of rides in total" error={errors.repeat}>
                <input id="total" className="field tabular" type="number" min={2} max={12} value={total} onChange={(e) => setTotal(Number(e.target.value))} aria-invalid={!!errors.repeat} aria-describedby={errors.repeat ? "total-error" : undefined} />
              </FormField>
            )}
          </div>
          {repeats.length > 0 && !errors.repeat && (
            <p className="rounded-xl bg-sage px-4 py-3 text-sm" aria-live="polite">
              <span className="font-semibold">{repeats.length + 1} rides:</span> {[`${date}`, ...repeats.map((r) => r.date)].map((d) => dayLabel(d)).join(", ")} at {time}.
            </p>
          )}
        </FormSection>

        <FormSection step={3} title="Seats and fare">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="seats" label="Free seats for others" hint="Not counting yourself.">
              <select id="seats" className="field" value={seats} onChange={(e) => setSeats(Number(e.target.value))}>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField id="fare" label="Expected total fare (₹)" error={errors.fare} hint="The real split uses the actual fare you enter after each ride.">
              <input id="fare" className="field tabular" inputMode="decimal" value={fare} onChange={(e) => setFare(e.target.value)} onBlur={touch} placeholder="600" aria-invalid={!!errors.fare} aria-describedby={errors.fare ? "fare-error" : "fare-hint"} />
            </FormField>
          </div>
          {fareValid && (
            <p className="tabular rounded-xl bg-sage px-4 py-3 text-sm" aria-live="polite">
              If all {seats} seats fill, each of the {seats + 1} people pays about <span className="font-semibold text-forest">{formatInr(individualShare(fareNum, seats + 1))}</span>.
            </p>
          )}
          <FormField id="note" label="Note for riders (optional)">
            <textarea id="note" className="field" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Meeting point details, luggage, anything riders should know." />
          </FormField>
        </FormSection>

        <div className="flex gap-3 border-t border-line pt-6">
          <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
            {busy ? "Posting..." : repeats.length > 0 ? `Post ${repeats.length + 1} rides` : "Post ride"}
          </button>
          <button type="button" className="btn btn-ghost btn-lg" onClick={() => router.back()}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

export default function NewRidePage() {
  return (
    <Ready>
      <NewRideForm />
    </Ready>
  );
}
