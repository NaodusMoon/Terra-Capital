"use client";

import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { STORAGE_KEYS } from "@/lib/constants";
import { readLocalStorage, writeLocalStorage } from "@/lib/storage";
import { getWalletBalances, type StellarNetwork, type WalletBalance } from "@/lib/stellar";
import {
  AVAILABLE_WALLET_OPTIONS,
  clearPendingWallet,
  connectWalletByProvider,
  connectWalletConnect,
  getPendingWallet,
  getWalletMap,
  removeUserWallet,
  setPendingWallet,
  setUserWallet,
  type ConnectableWalletProviderId,
  type StoredWallet,
  type WalletProviderId,
} from "@/lib/wallet";

interface WalletContextValue {
  walletAddress: string | null;
  walletProvider: WalletProviderId | null;
  network: StellarNetwork;
  walletOptions: typeof AVAILABLE_WALLET_OPTIONS;
  walletReady: boolean;
  connecting: boolean;
  loadingBalances: boolean;
  balances: WalletBalance[];
  error: string | null;
  setNetwork: (network: StellarNetwork) => void;
  connectWallet: (provider: ConnectableWalletProviderId) => Promise<boolean>;
  connectWithWalletConnect: () => Promise<string | null>;
  setConnectedWallet: (wallet: StoredWallet) => void;
  disconnectWallet: () => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [, setRevision] = useState(0);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balances, setBalances] = useState<WalletBalance[]>([]);
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [network, setNetworkState] = useState<StellarNetwork>(() => {
    const persisted = readLocalStorage<StellarNetwork>(STORAGE_KEYS.stellarNetwork, "testnet");
    return persisted === "public" ? "public" : "testnet";
  });
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
    const loadBalances = async () => {
      setLoadingBalances(true);
      try {
        const rows = await getWalletBalances(walletAddress, network);
        if (!active) return;
        const shortlisted = rows.filter((row) => row.asset === "XLM" || row.asset.toUpperCase().includes("USDT") || row.asset.toUpperCase().includes("USDC"));
        setBalances(shortlisted);
        setLoadingBalances(false);
      } catch {
        if (!active) return;
        setBalances([]);
        setLoadingBalances(false);
      }
    };
    void loadBalances();

    return () => {
      active = false;
    };
  }, [network, walletAddress]);

  const value = useMemo(
    () => ({
      walletAddress,
      walletProvider,
      network,
      walletOptions: AVAILABLE_WALLET_OPTIONS,
      connecting,
      walletReady,
      balances: walletAddress ? balances : [],
      loadingBalances: walletAddress ? loadingBalances : false,
      error,
      setNetwork: (nextNetwork: StellarNetwork) => {
        const safeNetwork = nextNetwork === "public" ? "public" : "testnet";
        setNetworkState(safeNetwork);
        writeLocalStorage(STORAGE_KEYS.stellarNetwork, safeNetwork);
      },
      connectWallet: async (provider: ConnectableWalletProviderId) => {
        setError(null);
        setConnecting(true);
        let result: Awaited<ReturnType<typeof connectWalletByProvider>>;
        try {
          result = await connectWalletByProvider(provider);
        } catch (error) {
          setError(error instanceof Error ? error.message : "No se pudo conectar la wallet.");
          return false;
        } finally {
          setConnecting(false);
        }

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
      connectWithWalletConnect: async () => {
        setError(null);
        setConnecting(true);
        let result: Awaited<ReturnType<typeof connectWalletConnect>>;
        try {
          result = await connectWalletConnect();
        } catch (error) {
          setError(error instanceof Error ? error.message : "No se pudo conectar WalletConnect.");
          return null;
        } finally {
          setConnecting(false);
        }

        if (!result.ok) {
          setError(result.message);
          return null;
        }

        setPendingWallet(result.wallet);
        if (user) {
          setUserWallet(user.id, result.wallet);
        }
        setRevision((prev) => prev + 1);
        return result.wallet.address;
      },
      setConnectedWallet: (wallet: StoredWallet) => {
        setError(null);
        setPendingWallet(wallet);
        if (user) {
          setUserWallet(user.id, wallet);
        }
        setRevision((prev) => prev + 1);
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
    [balances, connecting, error, loadingBalances, network, user, walletAddress, walletProvider, walletReady],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used within WalletProvider");
  return context;
}
