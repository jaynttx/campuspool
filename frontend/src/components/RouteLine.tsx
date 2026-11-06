/** Vertical route: pickup point, dotted line, destination. */
export function RouteLine({ from, to, large = false }: { from: string; to: string; large?: boolean }) {
  const text = large ? "text-lg" : "text-sm";
  return (
    <div className="flex gap-3" role="group" aria-label={`Route from ${from} to ${to}`}>
      <div className="flex flex-col items-center pt-1.5" aria-hidden="true">
        <span className="h-3 w-3 rounded-full border-2 border-forest bg-paper" />
        <span className={`my-1 w-0 flex-1 border-l-2 border-dotted border-line-strong ${large ? "min-h-8" : "min-h-5"}`} />
        <span className="h-3 w-3 rounded-full bg-forest ring-4 ring-lime/60" />
      </div>
      <div className={`flex flex-col justify-between ${text}`}>
        <div>
          <p className="eyebrow">From</p>
          <p className="font-medium">{from}</p>
        </div>
        <div className={large ? "mt-5" : "mt-3"}>
          <p className="eyebrow">To</p>
          <p className="font-semibold">{to}</p>
        </div>
      </div>
    </div>
  );
}
