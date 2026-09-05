interface Props {
  title: string;
  onClick: () => void;
  className?: string;
}

/** Icon-only trigger that opens an ImportModal — the upload-arrow mirror of
 * ExportButton, kept just as minimal: no label, a native `title` tooltip. */
export function ImportButton({ title, onClick, className = "" }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground ${className}`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 21V9" strokeLinecap="round" />
        <path d="M7 14l5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 5h16" strokeLinecap="round" />
      </svg>
    </button>
  );
}
