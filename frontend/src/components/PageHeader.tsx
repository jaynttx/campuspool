import type { ReactNode } from "react";

export function PageHeader({ title, intro, action, eyebrow }: { title: string; intro: string; action?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="font-display text-4xl font-semibold tracking-tight md:text-5xl">{title}</h1>
        <p className="mt-2 max-w-xl text-mist">{intro}</p>
      </div>
      {action}
    </div>
  );
}
