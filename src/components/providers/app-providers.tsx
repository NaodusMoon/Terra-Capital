"use client";

import { AuthProvider } from "@/components/providers/auth-provider";
import { AppPreload } from "@/components/layout/app-preload";
import { ResponsiveProvider } from "@/components/providers/responsive-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { WalletProvider } from "@/components/providers/wallet-provider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ResponsiveProvider>
      <ThemeProvider>
        <AuthProvider>
          <WalletProvider>
            <AppPreload />
            {children}
          </WalletProvider>
        </AuthProvider>
      </ThemeProvider>
    </ResponsiveProvider>
  );
}
