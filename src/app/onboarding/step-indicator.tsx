// Tiny progress strip — N segments, the current one filled, the rest dim.
// Pure visual; no labels because the step subjects ("Company", "Monday"…)
// already live as the card title.
const LABELS = ["Company", "Monday", "Branding", "Google", "Done"];

export function StepIndicator({
  current,
  total,
}: {
  current: number;
  total: number;
}) {
  return (
    <div>
      <div className="flex gap-1.5">
        {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
          <div
            key={n}
            className={`h-1.5 flex-1 rounded-full ${
              n <= current ? "bg-primary" : "bg-zinc-200 dark:bg-zinc-800"
            }`}
          />
        ))}
      </div>
      <div className="mt-2 text-xs uppercase tracking-wide text-muted-foreground">
        Step {current} of {total} · {LABELS[current - 1]}
      </div>
    </div>
  );
}
