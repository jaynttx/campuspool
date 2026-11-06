/** One dot per seat offered: filled when taken, outlined when free. */
export function SeatPips({ total, taken }: { total: number; taken: number }) {
  return (
    <span className="inline-flex items-center gap-1" role="img" aria-label={`${taken} of ${total} seats taken`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`h-2.5 w-2.5 rounded-full border-2 ${i < taken ? "border-forest bg-forest" : "border-line-strong bg-transparent"}`} />
      ))}
    </span>
  );
}
