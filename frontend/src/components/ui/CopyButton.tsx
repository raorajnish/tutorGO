"use client";

import { useState } from "react";

interface CopyButtonProps {
  text: string;
  label?: string;
  copiedLabel?: string;
  variant?: "primary" | "secondary" | "ghost" | "outline";
  size?: "sm" | "md";
  className?: string;
}

export function CopyButton({
  text,
  label = "Copy",
  copiedLabel = "Copied!",
  variant = "secondary",
  size = "sm",
  className = "",
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for non-secure context or older browsers
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const baseClasses =
    "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0";

  const sizeClasses = size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-2 text-sm";

  const variantClasses = {
    primary: "bg-primary text-primary-foreground hover:bg-primary/90",
    secondary: "bg-secondary text-secondary-foreground border border-border hover:bg-muted",
    outline: "border border-border text-foreground hover:bg-secondary",
    ghost: "text-muted-foreground hover:text-foreground hover:bg-secondary",
  }[variant];

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`${baseClasses} ${sizeClasses} ${variantClasses} ${className}`}
      title="Copy to clipboard"
    >
      {copied ? (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-success">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span className="text-success">{copiedLabel}</span>
        </>
      ) : (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          <span>{label}</span>
        </>
      )}
    </button>
  );
}
