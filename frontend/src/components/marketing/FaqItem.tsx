interface FaqItemProps {
  question: string;
  answer: string;
}

/**
 * Built on <details> so the accordion works without JS and stays keyboard- and
 * screen-reader-accessible for free.
 */
export function FaqItem({ question, answer }: FaqItemProps) {
  return (
    <details className="group rounded-2xl border border-border bg-card px-5 shadow-(--shadow-card) transition-colors duration-150 open:border-accent/30">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-left text-[15px] font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card">
        {question}
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-45 group-open:text-accent"
        >
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
      </summary>
      <p className="pb-5 pr-8 text-sm leading-relaxed text-muted-foreground">{answer}</p>
    </details>
  );
}
