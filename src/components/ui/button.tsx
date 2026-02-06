import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "outline";
}

export function Button({ className, variant = "primary", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[var(--color-background)]",
        variant === "primary" &&
          "bg-[var(--color-primary)] text-[var(--color-primary-contrast)] shadow-md shadow-black/10 hover:brightness-110",
        variant === "ghost" &&
          "bg-transparent text-[var(--color-foreground)] hover:bg-[var(--color-surface-soft)]",
        variant === "outline" &&
          "border border-[var(--color-border)] text-[var(--color-foreground)] hover:bg-[var(--color-surface-soft)]",
        className,
      )}
      {...props}
    />
  );
}

