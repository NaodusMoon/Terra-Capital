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

export function isValidStellarPublicKey(address: string) {
  return /^G[A-Z2-7]{55}$/.test(address.trim().toUpperCase());
}

export function connectManualWallet(address: string) {
  const normalized = address.trim().toUpperCase();
  if (!isValidStellarPublicKey(normalized)) {
    return {
      ok: false as const,
      message: "Direccion Stellar invalida. Debe comenzar con G y tener 56 caracteres.",
    };
  }

  return {
    ok: true as const,
    address: normalized,
  };
}

export async function connectFreighterWallet() {
  const connected = await isConnected();
  if (connected.error) {
    return {
      ok: false as const,
      message: connected.error.message || "No se pudo validar Freighter.",
    };
  }

  if (!connected.isConnected) {
    return {
      ok: false as const,
      message: "No detecto Freighter. Instala o habilita la extension.",
    };
  }

  const access = await requestAccess();
  if (access.error) {
    return {
      ok: false as const,
      message: access.error.message || "No autorizaste el acceso de Freighter.",
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
