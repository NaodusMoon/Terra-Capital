"use client";

import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { getWalletBalances, type WalletBalance } from "@/lib/stellar";
import {
  clearPendingWallet,
  connectWalletByProvider,
  getPendingWallet,
  getWalletMap,
  removeUserWallet,
  setPendingWallet,
  setUserWallet,
  WALLET_OPTIONS,
  type ConnectableWalletProviderId,
  type StoredWallet,
  type WalletProviderId,
} from "@/lib/wallet";

interface WalletContextValue {
  walletAddress: string | null;
  walletProvider: WalletProviderId | null;
  walletOptions: typeof WALLET_OPTIONS;
  walletReady: boolean;
  connecting: boolean;
  loadingBalances: boolean;
  balances: WalletBalance[];
  error: string | null;
  connectWallet: (provider: ConnectableWalletProviderId) => Promise<boolean>;
  disconnectWallet: () => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [, setRevision] = useState(0);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balances, setBalances] = useState<WalletBalance[]>([]);
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const walletMap: Record<string, StoredWallet> = hydrated ? getWalletMap() : {};
  const guestWallet = hydrated ? getPendingWallet() : null;
  const connectedWallet = user ? walletMap[user.id] ?? guestWallet : guestWallet;
  const walletAddress = connectedWallet?.address ?? null;
  const walletProvider = connectedWallet?.provider ?? null;
  const walletReady = hydrated;

  useEffect(() => {
    if (!walletAddress) return;

    let active = true;
    getWalletBalances(walletAddress)
      .then((rows) => {
        if (!active) return;
        const shortlisted = rows.filter((row) => row.asset === "XLM" || row.asset.toUpperCase().includes("USDT") || row.asset.toUpperCase().includes("USDC"));
        setBalances(shortlisted);
      })
      .catch(() => {
        if (!active) return;
        setBalances([]);
      });

    return () => {
      active = false;
    };
  }, [walletAddress]);

  const value = useMemo(
    () => ({
      walletAddress,
      walletProvider,
      walletOptions: WALLET_OPTIONS,
      connecting,
      walletReady,
      balances: walletAddress ? balances : [],
      loadingBalances: false,
      error,
      connectWallet: async (provider: ConnectableWalletProviderId) => {
        setError(null);
        setConnecting(true);
        const result = await connectWalletByProvider(provider);
        setConnecting(false);

        if (!result.ok) {
          setError(result.message);
          return false;
        }

        setPendingWallet(result.wallet);
        if (user) {
          setUserWallet(user.id, result.wallet);
        }
        setRevision((prev) => prev + 1);
        return true;
      },
      disconnectWallet: () => {
        clearPendingWallet();
        setBalances([]);
        if (user) {
          removeUserWallet(user.id);
        }
        setRevision((prev) => prev + 1);
      },
    }),
    [balances, connecting, error, user, walletAddress, walletProvider, walletReady],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used within WalletProvider");
  return context;
}
