"use client";

/** Accessible on/off toggle. */
export function Switch({ checked, onChange, label, description, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; id: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-4">
      <div>
        <p id={`${id}-label`} className="font-medium">
          {label}
        </p>
        {description && (
          <p id={`${id}-desc`} className="text-sm text-mist">
            {description}
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={description ? `${id}-desc` : undefined}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full border transition-colors ${checked ? "border-forest bg-forest" : "border-line-strong bg-sage"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full transition-all ${checked ? "left-[26px] bg-lime" : "left-0.5 bg-paper shadow"}`} />
      </button>
    </div>
  );
}
