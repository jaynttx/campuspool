"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ACTIVITY_LABEL, ACTIVITY_STYLE, ACTIVITY_TYPES } from "@/components/ActivityCard";
import { FormField, FormSection } from "@/components/FormField";
import { PageHeader } from "@/components/PageHeader";
import { Ready } from "@/components/Ready";
import { isPast, toISODate, toTime } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { ActivityType } from "@/data/types";

type Errors = Partial<Record<"title" | "location" | "when" | "max", string>>;

function NewActivityForm() {
  const router = useRouter();
  const { actions, settings } = useStore();
  const later = new Date(Date.now() + 2 * 3600 * 1000);
  const [type, setType] = useState<ActivityType>(settings.defaultActivityType);
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [date, setDate] = useState(toISODate(later));
  const [time, setTime] = useState(toTime(later));
  const [max, setMax] = useState(4);
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<Errors>({});

  function validate(): Errors {
    const e: Errors = {};
    if (!title.trim()) e.title = "Give the activity a short title.";
    if (!location.trim()) e.location = "Add where it happens.";
    if (!date || !time) e.when = "Pick a date and a time.";
    else if (isPast(date, time)) e.when = "That time has already passed. Pick a later time.";
    if (!Number.isInteger(max) || max < 2 || max > 30) e.max = "Choose between 2 and 30 people, including you.";
    return e;
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    const res = await actions.createActivity({ type, title: title.trim(), location: location.trim(), date, time, maxParticipants: max, description: description.trim() });
    if (res.ok && res.id) router.push(`/company/${res.id}`);
  }

  const touch = () => setErrors(validate());

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow="Find Company" title="Post an activity" intro="Invite students to play, study, eat or hang out. Activities are always free of payment." />
      <form onSubmit={submit} className="card space-y-6 p-6 md:p-8" noValidate>
        <FormSection step={1} title="What">
          <fieldset>
            <legend className="label">Type</legend>
            <div className="flex flex-wrap gap-2">
              {ACTIVITY_TYPES.map((t) => {
                const { Icon } = ACTIVITY_STYLE[t];
                return (
                  <button key={t} type="button" aria-pressed={type === t} onClick={() => setType(t)} className={`btn btn-sm ${type === t ? "btn-primary" : "btn-ghost"}`}>
                    <Icon className="h-4 w-4" aria-hidden="true" /> {ACTIVITY_LABEL[t]}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <FormField id="title" label="Title" error={errors.title}>
            <input id="title" className="field" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={touch} placeholder="e.g. Badminton doubles, need two more" aria-invalid={!!errors.title} aria-describedby={errors.title ? "title-error" : undefined} />
          </FormField>
          <FormField id="description" label="Description (optional)">
            <textarea id="description" className="field" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </FormField>
        </FormSection>

        <FormSection step={2} title="When and where">
          <FormField id="location" label="Location" error={errors.location}>
            <input id="location" className="field" value={location} onChange={(e) => setLocation(e.target.value)} onBlur={touch} placeholder="e.g. Sports complex, court 3" aria-invalid={!!errors.location} aria-describedby={errors.location ? "location-error" : undefined} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="adate" label="Date" error={errors.when}>
              <input id="adate" className="field" type="date" value={date} min={toISODate(new Date())} onChange={(e) => setDate(e.target.value)} onBlur={touch} aria-invalid={!!errors.when} aria-describedby={errors.when ? "adate-error" : undefined} />
            </FormField>
            <FormField id="atime" label="Time">
              <input id="atime" className="field" type="time" value={time} onChange={(e) => setTime(e.target.value)} onBlur={touch} aria-invalid={!!errors.when} />
            </FormField>
          </div>
        </FormSection>

        <FormSection step={3} title="Group size">
          <div className="max-w-xs">
            <FormField id="max" label="Max people, including you" error={errors.max}>
              <input id="max" className="field tabular" type="number" min={2} max={30} value={max} onChange={(e) => setMax(Number(e.target.value))} onBlur={touch} aria-invalid={!!errors.max} aria-describedby={errors.max ? "max-error" : undefined} />
            </FormField>
          </div>
        </FormSection>

        <div className="flex gap-3 border-t border-line pt-6">
          <button type="submit" className="btn btn-primary btn-lg">
            Post activity
          </button>
          <button type="button" className="btn btn-ghost btn-lg" onClick={() => router.back()}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

export default function NewActivityPage() {
  return (
    <Ready>
      <NewActivityForm />
    </Ready>
  );
}
