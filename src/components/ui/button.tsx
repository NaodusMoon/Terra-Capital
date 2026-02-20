import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "outline";
}

export function Button({ className, variant = "primary", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-background",
        variant === "primary" &&
          "bg-primary text-primary-contrast shadow-md shadow-black/10 hover:brightness-110",
        variant === "secondary" &&
          "bg-secondary text-[#1c1f26] shadow-md shadow-black/10 hover:brightness-110",
        variant === "ghost" &&
          "bg-transparent text-foreground hover:bg-surface-soft",
        variant === "outline" &&
          "border border-border text-foreground hover:bg-surface-soft",
        className,
      )}
      {...props}
    />
  );
}

