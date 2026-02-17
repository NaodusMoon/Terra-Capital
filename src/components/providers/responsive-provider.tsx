"use client";

import { createContext, useContext, useEffect, useMemo } from "react";
import { useMediaQuery } from "react-responsive";

type ResponsiveContextValue = {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isWide: boolean;
};

const ResponsiveContext = createContext<ResponsiveContextValue | null>(null);

export function ResponsiveProvider({ children }: { children: React.ReactNode }) {
  const isMobile = useMediaQuery({ maxWidth: 767 });
  const isTablet = useMediaQuery({ minWidth: 768, maxWidth: 1023 });
  const isDesktop = useMediaQuery({ minWidth: 1024 });
  const isWide = useMediaQuery({ minWidth: 1440 });

  const value = useMemo(
    () => ({ isMobile, isTablet, isDesktop, isWide }),
    [isDesktop, isMobile, isTablet, isWide],
  );

  useEffect(() => {
    const viewport = isWide ? "wide" : isDesktop ? "desktop" : isTablet ? "tablet" : "mobile";
    document.documentElement.dataset.viewport = viewport;
  }, [isDesktop, isTablet, isMobile, isWide]);

  return <ResponsiveContext.Provider value={value}>{children}</ResponsiveContext.Provider>;
}

export function useResponsive() {
  const context = useContext(ResponsiveContext);
  if (!context) {
    throw new Error("useResponsive debe usarse dentro de ResponsiveProvider.");
  }
  return context;
}
