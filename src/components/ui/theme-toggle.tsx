"use client";

import { useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Moon, SunMedium } from "lucide-react";
import { useTheme } from "@/components/providers/theme-provider";

export function ThemeToggle() {
  const { theme, resolvedTheme, toggleTheme } = useTheme();
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const isDark = hydrated ? resolvedTheme === "dark" : false;

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      title={hydrated && theme === "system" ? "Siguiendo dispositivo" : isDark ? "Modo claro" : "Modo oscuro"}
      className="relative inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] transition hover:bg-[var(--color-surface-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
    >
      {!hydrated ? (
        <Moon size={17} className="opacity-70" />
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={theme}
            initial={{ rotate: -35, scale: 0.6, opacity: 0 }}
            animate={{ rotate: 0, scale: 1, opacity: 1 }}
            exit={{ rotate: 35, scale: 0.6, opacity: 0 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
            className="relative z-10"
          >
            {isDark ? <SunMedium size={17} /> : <Moon size={17} />}
          </motion.span>
        </AnimatePresence>
      )}
    </button>
  );
}
