"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { connectFreighterWallet, getWalletMap, removeUserWallet, setUserWallet } from "@/lib/wallet";
import { useAuth } from "@/components/providers/auth-provider";

interface WalletContextValue {
  walletAddress: string | null;
  connecting: boolean;
  walletReady: boolean;
  error: string | null;
  connectWallet: () => Promise<boolean>;
  disconnectWallet: () => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [walletMap, setWalletMap] = useState<Record<string, string>>(() => getWalletMap());
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const walletAddress = user ? walletMap[user.id] ?? null : null;

  const value = useMemo(
    () => ({
      walletAddress,
      connecting,
      walletReady: true,
      error,
      connectWallet: async () => {
        if (!user) return false;

        setError(null);
        setConnecting(true);

        const result = await connectFreighterWallet();
        setConnecting(false);

        if (!result.ok) {
          setError(result.message);
          return false;
        }

        setUserWallet(user.id, result.address);
        setWalletMap((prev) => ({ ...prev, [user.id]: result.address }));
        return true;
      },
      disconnectWallet: () => {
        if (!user) return;
        removeUserWallet(user.id);
        setWalletMap((prev) => {
          const next = { ...prev };
          delete next[user.id];
          return next;
        });
        logout();
      },
    }),
    [connecting, error, logout, user, walletAddress],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used within WalletProvider");
  }

  return context;
}
