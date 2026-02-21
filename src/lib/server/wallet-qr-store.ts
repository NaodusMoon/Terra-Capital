interface WalletQrRecord {
  id: string;
  createdAt: number;
  expiresAt: number;
  walletAddress?: string;
  walletProvider?: "freighter" | "xbull" | "albedo" | "manual";
}

const STORE_KEY = "__terra_wallet_qr_store__";
const TTL_MS = 10 * 60 * 1000;

function getStore() {
  const globalRef = globalThis as typeof globalThis & {
    [STORE_KEY]?: Map<string, WalletQrRecord>;
  };

  if (!globalRef[STORE_KEY]) {
    globalRef[STORE_KEY] = new Map<string, WalletQrRecord>();
  }

  return globalRef[STORE_KEY];
}

function cleanupExpired() {
  const now = Date.now();
  const store = getStore();
  for (const [id, record] of store.entries()) {
    if (record.expiresAt <= now) {
      store.delete(id);
    }
  }
}

export function createWalletQrSession() {
  cleanupExpired();
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  const record: WalletQrRecord = {
    id,
    createdAt,
    expiresAt: createdAt + TTL_MS,
  };
  getStore().set(id, record);
  return record;
}

export function getWalletQrSession(id: string) {
  cleanupExpired();
  return getStore().get(id) ?? null;
}

export function claimWalletQrSession(input: {
  id: string;
  walletAddress: string;
  walletProvider: "freighter" | "xbull" | "albedo" | "manual";
}) {
  cleanupExpired();
  const session = getStore().get(input.id);
  if (!session) return null;

  const updated: WalletQrRecord = {
    ...session,
    walletAddress: input.walletAddress,
    walletProvider: input.walletProvider,
  };

  getStore().set(input.id, updated);
  return updated;
}
