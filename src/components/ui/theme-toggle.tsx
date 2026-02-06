"use client";

import { useSyncExternalStore } from "react";
import { Moon, SunMedium } from "lucide-react";
import { useTheme } from "@/components/providers/theme-provider";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  return (
    <Button type="button" variant="outline" className="gap-2" onClick={toggleTheme}>
      {!hydrated ? (
        <>
          <SunMedium size={16} className="opacity-0" />
          Tema
        </>
      ) : (
        <>
          {theme === "dark" ? <SunMedium size={16} /> : <Moon size={16} />}
          {theme === "dark" ? "Modo claro" : "Modo oscuro"}
        </>
      )}
    </Button>
  );
}
