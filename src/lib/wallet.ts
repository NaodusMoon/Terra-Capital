import albedo from "@albedo-link/intent";
import { getAddress, isConnected, requestAccess } from "@stellar/freighter-api";
import { STORAGE_KEYS } from "@/lib/constants";
import { isValidStellarPublicKey } from "@/lib/security";
import { readLocalStorage, writeLocalStorage } from "@/lib/storage";

export type WalletProviderId = "freighter" | "xbull" | "albedo" | "manual";
export type ConnectableWalletProviderId = Exclude<WalletProviderId, "manual">;

export interface StoredWallet {
  address: string;
  provider: WalletProviderId;
}

interface WalletMap {
  [userId: string]: StoredWallet;
}

declare global {
  interface Window {
    xBullSDK?: {
      connect: (options?: { canRequestPublicKey?: boolean; canRequestSign?: boolean }) => Promise<unknown>;
      getPublicKey: () => Promise<string | { publicKey?: string; pubkey?: string }>;
    };
  }
}

export const WALLET_OPTIONS: Array<{ id: ConnectableWalletProviderId; label: string }> = [
  { id: "freighter", label: "Freighter" },
  { id: "xbull", label: "xBull" },
  { id: "albedo", label: "Albedo" },
];

const providerLabelMap: Record<WalletProviderId, string> = {
  freighter: "Freighter",
  xbull: "xBull",
  albedo: "Albedo",
  manual: "Movil/Manual",
};

function isWalletProviderId(value: unknown): value is WalletProviderId {
  return value === "freighter" || value === "xbull" || value === "albedo" || value === "manual";
}

export function getWalletProviderLabel(provider: WalletProviderId) {
  return providerLabelMap[provider];
}

function normalizeAddress(raw: string) {
  return raw.trim();
}

function parseXBullPublicKey(value: Awaited<ReturnType<NonNullable<Window["xBullSDK"]>["getPublicKey"]>>) {
  if (typeof value === "string") return value;
  if (value?.publicKey) return value.publicKey;
  if (value?.pubkey) return value.pubkey;
  return "";
}

export function getWalletMap() {
  const raw = readLocalStorage<Record<string, string | StoredWallet>>(STORAGE_KEYS.wallets, {});
  const normalized: WalletMap = {};

  for (const [userId, value] of Object.entries(raw)) {
    if (typeof value === "string") {
      const address = normalizeAddress(value);
      if (isValidStellarPublicKey(address)) {
        normalized[userId] = { address, provider: "freighter" };
      }
      continue;
    }

    if (!value) continue;
    const address = normalizeAddress(value.address);
    if (!isValidStellarPublicKey(address)) continue;
    normalized[userId] = {
      address,
      provider: isWalletProviderId(value.provider) ? value.provider : "manual",
    };
  }

  return normalized;
}

export function getPendingWallet() {
  const wallet = readLocalStorage<StoredWallet | null>(STORAGE_KEYS.pendingWallet, null);
  if (!wallet || !isValidStellarPublicKey(wallet.address)) return null;
  return wallet;
}

export function setPendingWallet(wallet: StoredWallet) {
  writeLocalStorage(STORAGE_KEYS.pendingWallet, wallet);
}

export function clearPendingWallet() {
  writeLocalStorage(STORAGE_KEYS.pendingWallet, null);
}

export function getUserWallet(userId: string) {
  const map = getWalletMap();
  return map[userId] ?? null;
}

export function setUserWallet(userId: string, wallet: StoredWallet) {
  const map = getWalletMap();
  map[userId] = wallet;
  writeLocalStorage(STORAGE_KEYS.wallets, map);
  setPendingWallet(wallet);
}

export function removeUserWallet(userId: string) {
  const map = getWalletMap();
  delete map[userId];
  writeLocalStorage(STORAGE_KEYS.wallets, map);
}

async function connectFreighterWallet() {
  const connected = await isConnected();
  if (connected.error) {
    return {
      ok: false as const,
      message: connected.error.message || "No se pudo validar Freighter.",
    };
  }

  const access = await requestAccess();
  if (access.error) {
    const detail = access.error.message || "";
    if (detail.toLowerCase().includes("not connected") || detail.toLowerCase().includes("not installed")) {
      return {
        ok: false as const,
        message: "No detecto Freighter. Instala o habilita la extension.",
      };
    }

    return {
      ok: false as const,
      message: detail || "No autorizaste el acceso de Freighter.",
    };
  }

  const addressResult = await getAddress();
  if (addressResult.error) {
    return {
      ok: false as const,
      message: addressResult.error.message || "No se pudo obtener la direccion publica.",
    };
  }

  const address = normalizeAddress(addressResult.address);
  if (!isValidStellarPublicKey(address)) {
    return { ok: false as const, message: "Freighter devolvio una direccion invalida." };
  }

  return {
    ok: true as const,
    wallet: {
      address,
      provider: "freighter" as const,
    },
  };
}

async function connectXBullWallet() {
  if (typeof window === "undefined" || !window.xBullSDK) {
    return {
      ok: false as const,
      message: "No detecto xBull. Instala o habilita la extension.",
    };
  }

  try {
    await window.xBullSDK.connect({
      canRequestPublicKey: true,
      canRequestSign: false,
    });
    const publicKey = parseXBullPublicKey(await window.xBullSDK.getPublicKey());
    const address = normalizeAddress(publicKey);

    if (!isValidStellarPublicKey(address)) {
      return { ok: false as const, message: "xBull devolvio una direccion invalida." };
    }

    return {
      ok: true as const,
      wallet: {
        address,
        provider: "xbull" as const,
      },
    };
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "No autorizaste el acceso de xBull.",
    };
  }
}

async function connectAlbedoWallet() {
  try {
    const response = await albedo.publicKey({ token: crypto.randomUUID() });
    const address = normalizeAddress(response.pubkey);

    if (!isValidStellarPublicKey(address)) {
      return { ok: false as const, message: "Albedo devolvio una direccion invalida." };
    }

    return {
      ok: true as const,
      wallet: {
        address,
        provider: "albedo" as const,
      },
    };
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "No autorizaste el acceso de Albedo.",
    };
  }
}

export async function connectWalletByProvider(provider: ConnectableWalletProviderId) {
  if (provider === "freighter") return connectFreighterWallet();
  if (provider === "xbull") return connectXBullWallet();
  return connectAlbedoWallet();
}
