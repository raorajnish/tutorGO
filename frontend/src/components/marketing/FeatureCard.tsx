import type { ReactNode } from "react";

interface FeatureCardProps {
  title: string;
  description: string;
  /** Illustration rendered as the card's header image. */
  scene?: ReactNode;
  /** Small mark shown instead of a scene, for the compact variant. */
  icon?: ReactNode;
  /** Short capability chips shown under the description. */
  points?: string[];
}

export function FeatureCard({ title, description, scene, icon, points }: FeatureCardProps) {
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-(--shadow-card) transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-(--shadow-card-hover)">
      {scene && (
        <div aria-hidden="true" className="border-b border-border bg-muted/40 p-4 pb-0">
          {/* The scene sits flush to the card's bottom edge so it reads as an
              illustration cropped by the card, not a boxed thumbnail. */}
          <div className="overflow-hidden rounded-t-xl">{scene}</div>
        </div>
      )}

      <div className="flex flex-1 flex-col p-6">
        {!scene && icon && (
          <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent transition-colors duration-200 group-hover:bg-accent group-hover:text-accent-foreground">
            {icon}
          </div>
        )}

        <h3 className="font-display text-base font-semibold text-foreground">{title}</h3>
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
    </article>
  );
}
