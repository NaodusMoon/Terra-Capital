"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { STORAGE_KEYS } from "@/lib/constants";
import { isBrowser, readLocalStorage, writeLocalStorage } from "@/lib/storage";

export const SUPPORTED_LANGUAGES = ["es", "en", "pt", "fr"] as const;

export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

interface LanguageContextValue {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function resolveInitialLanguage(): AppLanguage {
  const stored = readLocalStorage<string>(STORAGE_KEYS.language, "es");
  if (SUPPORTED_LANGUAGES.includes(stored as AppLanguage)) {
    return stored as AppLanguage;
  }

  if (!isBrowser) return "es";
  const browserLanguage = window.navigator.language.toLowerCase();
  if (browserLanguage.startsWith("en")) return "en";
  if (browserLanguage.startsWith("pt")) return "pt";
  if (browserLanguage.startsWith("fr")) return "fr";
  return "es";
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<AppLanguage>(resolveInitialLanguage);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dataset.language = language;
    writeLocalStorage(STORAGE_KEYS.language, language);
  }, [language]);

  const value = useMemo(() => ({ language, setLanguage }), [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return context;
}
