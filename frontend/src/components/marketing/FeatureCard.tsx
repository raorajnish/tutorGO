import type { ReactNode } from "react";

interface FeatureCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  /** Short capability chips shown under the description. */
  points?: string[];
}

export function FeatureCard({ icon, title, description, points }: FeatureCardProps) {
  return (
    <div className="group relative flex h-full flex-col rounded-2xl border border-border bg-card p-6 shadow-(--shadow-card) transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-(--shadow-card-hover)">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent transition-colors duration-200 group-hover:bg-accent group-hover:text-accent-foreground">
        {icon}
      </div>

      <h3 className="font-display mt-5 text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>

      {points && points.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-1.5">
          {points.map((point) => (
            <li
              key={point}
              className="rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] font-medium text-secondary-foreground"
            >
              {point}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
