import { getAddress, isConnected, requestAccess } from "@stellar/freighter-api";
import { STORAGE_KEYS } from "@/lib/constants";
import { readLocalStorage, writeLocalStorage } from "@/lib/storage";

interface WalletMap {
  [userId: string]: string;
}

export function getWalletMap() {
  return readLocalStorage<WalletMap>(STORAGE_KEYS.wallets, {});
}

export function getUserWallet(userId: string) {
  const map = getWalletMap();
  return map[userId] ?? null;
}

export function setUserWallet(userId: string, address: string) {
  const map = getWalletMap();
  map[userId] = address;
  writeLocalStorage(STORAGE_KEYS.wallets, map);
}

export function removeUserWallet(userId: string) {
  const map = getWalletMap();
  delete map[userId];
  writeLocalStorage(STORAGE_KEYS.wallets, map);
}

export async function connectFreighterWallet() {
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
    if (
      detail.toLowerCase().includes("not connected") ||
      detail.toLowerCase().includes("not installed")
    ) {
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

  return {
    ok: true as const,
    address: addressResult.address,
  };
}
