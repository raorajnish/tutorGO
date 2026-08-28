interface SectionHeadingProps {
  eyebrow: string;
  title: string;
  description?: string;
  /** Centres the block and caps its width — used by full-width feature sections. */
  centered?: boolean;
}

export function SectionHeading({ eyebrow, title, description, centered = false }: SectionHeadingProps) {
  return (
    <div className={centered ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      <span className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-accent">
        {eyebrow}
      </span>
      <h2 className="font-display mt-4 text-2xl font-semibold tracking-tight text-balance text-foreground sm:text-3xl lg:text-[2.125rem]">
        {title}
      </h2>
      {description && <p className="mt-3 text-base leading-relaxed text-muted-foreground">{description}</p>}
    </div>
  );
}
