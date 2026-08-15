import { forwardRef, type TextareaHTMLAttributes } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  maxLength?: number;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, id, className = "", maxLength, value, ...props },
  ref
) {
  const length = typeof value === "string" ? value.length : 0;

  return (
    <div className="flex flex-col gap-1.5">
      {(label || maxLength) && (
        <div className="flex items-center justify-between">
          {label && (
            <label htmlFor={id} className="text-sm font-medium text-foreground">
              {label}
            </label>
          )}
          {maxLength && (
            <span className="text-xs text-muted-foreground">
              {length}/{maxLength}
            </span>
          )}
        </div>
      )}
      <textarea
        ref={ref}
        id={id}
        value={value}
        maxLength={maxLength}
        rows={3}
        className={`resize-none rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent ${error ? "border-danger" : ""} ${className}`}
        {...props}
      />
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
});
