interface Stat {
  label: string;
  value: string | number;
}

interface ProfileCardProps {
  name: string;
  subtitle: string;
  note?: string;
  stats: Stat[];
}

export function ProfileCard({ name, subtitle, note, stats }: ProfileCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 transition-colors duration-150 hover:border-primary/30">
      <div className="flex flex-col items-center text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-xl font-semibold text-accent-foreground">
          {name.charAt(0).toUpperCase()}
          <span className="sr-only">{name}</span>
        </div>
        <p className="font-display mt-3 text-base font-semibold text-foreground">{name}</p>
        <p className="text-sm text-muted-foreground">{subtitle}</p>

        {note && (
          <div className="mt-4 w-full rounded-xl bg-secondary px-4 py-3 text-sm leading-relaxed text-secondary-foreground">
            {note}
          </div>
        )}
      </div>

      <div className="mt-5 grid grid-cols-3 divide-x divide-border border-t border-border pt-4">
        {stats.map((s) => (
          <div key={s.label} className="text-center">
            <p className="font-display text-lg font-semibold text-foreground">{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
