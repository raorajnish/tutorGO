import type { ReactNode } from "react";

interface BentoCardProps {
  variant?: "featured" | "light" | "tinted";
  badge?: string;
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  glyph?: ReactNode;
  className?: string;
}

const VARIANT_CLASSES = {
  featured: "bg-primary text-primary-foreground",
  light: "bg-card text-foreground border border-border",
  tinted: "bg-secondary text-secondary-foreground",
};

export function BentoCard({ variant = "light", badge, title, description, footer, glyph, className = "" }: BentoCardProps) {
  const isDark = variant === "featured";

  return (
    <div className={`relative flex flex-col justify-between overflow-hidden rounded-xl p-6 ${VARIANT_CLASSES[variant]} ${className}`}>
      {glyph && <div className="pointer-events-none absolute -right-4 -bottom-4 opacity-[0.08]">{glyph}</div>}

      <div className="relative">
        {badge && (
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
              isDark ? "bg-primary-foreground/15 text-primary-foreground" : "bg-card text-foreground"
            }`}
          >
            {badge}
          </span>
        )}
        <div className="font-display mt-3 text-xl font-semibold leading-snug">{title}</div>
        {description && (
          <p className={`mt-2 text-sm leading-relaxed ${isDark ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
            {description}
          </p>
        )}
      </div>

      {footer && <div className="relative mt-6 flex items-center justify-between gap-3">{footer}</div>}
    </div>
  );
}
