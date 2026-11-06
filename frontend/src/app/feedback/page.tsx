"use client";

import { useState, type FormEvent } from "react";
import { FormField } from "@/components/FormField";
import { PageHeader } from "@/components/PageHeader";
import { Ready } from "@/components/Ready";
import { api, errorMessage } from "@/lib/api";

const CATEGORIES = [
  { value: "bug", label: "Something is broken" },
  { value: "idea", label: "An idea" },
  { value: "praise", label: "Something I like" },
  { value: "other", label: "Other" },
] as const;

function FeedbackForm() {
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]["value"]>("idea");
  const [rating, setRating] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (message.trim().length < 5) return setError("Tell us a little more, at least a few words.");
    setError("");
    setBusy(true);
    try {
      await api("/feedback", { method: "POST", body: { category, rating, message: message.trim() } });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="card mx-auto max-w-xl p-8 text-center">
        <p className="font-display text-3xl font-semibold">Thank you</p>
        <p className="mt-2 text-mist">Your feedback reached the CampusPool team.</p>
        <button
          type="button"
          className="btn btn-primary mt-5"
          onClick={() => {
            setSent(false);
            setMessage("");
            setRating(null);
          }}
        >
          Send more feedback
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader eyebrow="Help us improve" title="Feedback" intro="Report a problem, suggest an idea, or tell us what works. Your name is shared with the team so we can follow up." />
      <form onSubmit={submit} className="card space-y-5 p-6" noValidate>
        <fieldset>
          <legend className="label">What is it about?</legend>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button key={c.value} type="button" aria-pressed={category === c.value} onClick={() => setCategory(c.value)} className={`btn btn-sm ${category === c.value ? "btn-primary" : "btn-ghost"}`}>
                {c.label}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="label">How is CampusPool working for you? (optional)</legend>
          <div className="flex gap-2" role="radiogroup" aria-label="Rating from 1 to 5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={rating === n} onClick={() => setRating(rating === n ? null : n)} className={`btn btn-sm tabular w-11 ${rating === n ? "btn-primary" : "btn-ghost"}`}>
                {n}
              </button>
            ))}
          </div>
          <p className="hint">1 is poor, 5 is great.</p>
        </fieldset>
        <FormField id="fb-message" label="Your message" error={error}>
          <textarea id="fb-message" className="field" rows={6} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} aria-invalid={!!error} aria-describedby={error ? "fb-message-error" : undefined} />
          <p className="hint tabular">{message.length} / 1000</p>
        </FormField>
        <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
          {busy ? "Sending..." : "Send feedback"}
        </button>
      </form>
    </div>
  );
}

export default function FeedbackPage() {
  return (
    <Ready>
      <FeedbackForm />
    </Ready>
  );
}
