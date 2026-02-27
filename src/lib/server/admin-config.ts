import "server-only";

export const PLATFORM_OWNER_NAME = "Naodus";
export const PLATFORM_OWNER_WALLET = "GDQM3R3UTY7M4QJGNANWZ4QXQYADQCMM65FZFAD3Y6Y7UOCKFYNFDI3J";

export function isPlatformOwnerWallet(walletAddress: string) {
  return walletAddress.trim().toUpperCase() === PLATFORM_OWNER_WALLET;
}

