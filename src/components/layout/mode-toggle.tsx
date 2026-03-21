"use client";

import { motion } from "framer-motion";
import type { UserMode } from "@/types/auth";
import { useLanguage } from "@/components/providers/language-provider";
import { cn } from "@/lib/utils";

interface ModeToggleProps {
  mode: UserMode;
  onChange: (mode: UserMode) => void;
  className?: string;
  compact?: boolean;
  layoutId?: string;
}

export function ModeToggle({ mode, onChange, className, compact = false, layoutId = "mode-toggle-pill" }: ModeToggleProps) {
  const { language } = useLanguage();
  const labels = language === "es"
    ? { buyer: "Comprador", seller: "Vendedor" }
    : { buyer: "Buyer", seller: "Seller" };
  const baseButton = compact ? "px-2 py-2 text-[10px] min-[400px]:px-3 min-[400px]:text-[11px]" : "px-4 py-2 text-xs";

  return (
    <div className={cn("relative grid grid-cols-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-1", className)}>
      {mode === "buyer" && (
        <motion.span
          layoutId={layoutId}
          className="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-[var(--color-primary)] shadow-[0_6px_18px_rgba(0,0,0,0.2)]"
          transition={{ type: "spring", stiffness: 450, damping: 34 }}
        />
      )}
      {mode === "seller" && (
        <motion.span
          layoutId={layoutId}
          className="absolute inset-y-1 right-1 w-[calc(50%-4px)] rounded-full bg-[var(--color-primary)] shadow-[0_6px_18px_rgba(0,0,0,0.2)]"
          transition={{ type: "spring", stiffness: 450, damping: 34 }}
        />
      )}

      <button
        type="button"
        onClick={() => onChange("buyer")}
        className={cn("relative z-10 rounded-full font-semibold transition", baseButton, mode === "buyer" ? "text-[var(--color-primary-contrast)]" : "text-[var(--color-foreground)]")}
      >
        {labels.buyer}
      </button>
      <button
        type="button"
        onClick={() => onChange("seller")}
        className={cn("relative z-10 rounded-full font-semibold transition", baseButton, mode === "seller" ? "text-[var(--color-primary-contrast)]" : "text-[var(--color-foreground)]")}
      >
        {labels.seller}
      </button>
    </div>
  );
}
