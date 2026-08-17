import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "accent" | "secondary" | "ghost" | "destructive";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50",
  accent: "bg-accent text-accent-foreground hover:bg-accent/90 disabled:opacity-50",
  secondary: "bg-card text-foreground border border-border hover:bg-secondary disabled:opacity-50",
  ghost: "text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-50",
  destructive: "bg-danger text-danger-foreground hover:bg-danger/90 disabled:opacity-50",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
