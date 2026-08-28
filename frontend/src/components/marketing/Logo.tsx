interface LogoProps {
  /** Tailwind size classes for the mark. Defaults to the nav size. */
  className?: string;
}

/** The TutorGO mark — a rounded tile with a stylised "graduation" chevron. */
export function Logo({ className = "h-9 w-9" }: LogoProps) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground ${className}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[55%] w-[55%]">
        <path d="M2.5 8.5L12 4l9.5 4.5L12 13 2.5 8.5z" strokeLinejoin="round" />
        <path d="M6.5 10.8V15c0 1.7 2.5 3 5.5 3s5.5-1.3 5.5-3v-4.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
