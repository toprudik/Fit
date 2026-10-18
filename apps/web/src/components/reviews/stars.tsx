import { RATINGS } from "@/lib/reviews/reviews";
import { cn } from "@/lib/utils";

/** A rating as five stars, read out as "Оценка 4 из 5". */
export function Stars({ rating, label, className }: { rating: number; label: string; className?: string }) {
  return (
    <span role="img" aria-label={label} className={cn("flex gap-0.5 text-headline leading-none", className)}>
      {RATINGS.map((n) => (
        <span key={n} aria-hidden className={n <= rating ? "text-accent" : "text-ink-2"}>
          ★
        </span>
      ))}
    </span>
  );
}
