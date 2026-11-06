import type { ReactNode } from "react";

/** Label + control + hint/error, wired for screen readers. Pass `id` to the control as well. */
export function FormField({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="error-text">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function FormSection({ step, title, children }: { step: number; title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4 border-t border-line pt-6 first:border-t-0 first:pt-0">
      <legend className="mb-1 flex items-center gap-3 font-display text-xl font-semibold">
        <span className="tabular flex h-7 w-7 items-center justify-center rounded-full bg-lime text-sm font-semibold text-forest-deep">{step}</span>
        {title}
      </legend>
      {children}
    </fieldset>
  );
}
