"use client";

import { AuthProvider } from "@/components/providers/auth-provider";
import { ResponsiveProvider } from "@/components/providers/responsive-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { WalletProvider } from "@/components/providers/wallet-provider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ResponsiveProvider>
      <ThemeProvider>
        <AuthProvider>
          <WalletProvider>{children}</WalletProvider>
        </AuthProvider>
      </ThemeProvider>
    </ResponsiveProvider>
  );
}
