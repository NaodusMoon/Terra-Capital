import "server-only";

const STORE_KEY = "__terra_wallet_login_challenge_store__";
const TTL_MS = 5 * 60 * 1000;

interface WalletLoginChallengeRecord {
  id: string;
  walletAddress: string;
  walletProvider: string;
  message: string;
  clientIp: string;
  createdAt: number;
  expiresAt: number;
}

type Store = Map<string, WalletLoginChallengeRecord>;

type GlobalWithStore = typeof globalThis & {
  [STORE_KEY]?: Store;
};

function getStore() {
  const ref = globalThis as GlobalWithStore;
  if (!ref[STORE_KEY]) {
    ref[STORE_KEY] = new Map<string, WalletLoginChallengeRecord>();
  }
  return ref[STORE_KEY]!;
}

function cleanupExpired(now: number) {
  const store = getStore();
  for (const [id, row] of store.entries()) {
    if (row.expiresAt <= now) {
      store.delete(id);
    }
  }
}

export function createWalletLoginChallenge(input: {
  walletAddress: string;
  walletProvider: string;
  clientIp: string;
  requestOrigin: string;
}) {
  const now = Date.now();
  cleanupExpired(now);
  const id = crypto.randomUUID();
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const issuedAtIso = new Date(now).toISOString();
  const message = [
    "Terra Capital Wallet Login",
    `Origin: ${input.requestOrigin || "unknown"}`,
    `Address: ${input.walletAddress}`,
    `Provider: ${input.walletProvider}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAtIso}`,
    "Purpose: authenticate login",
  ].join("\n");

  const row: WalletLoginChallengeRecord = {
    id,
    walletAddress: input.walletAddress,
    walletProvider: input.walletProvider,
    message,
    clientIp: input.clientIp,
    createdAt: now,
    expiresAt: now + TTL_MS,
  };
  getStore().set(id, row);
  return row;
}

export function consumeWalletLoginChallenge(input: {
  id: string;
  walletAddress: string;
  walletProvider: string;
  clientIp: string;
}) {
  const now = Date.now();
  cleanupExpired(now);
  const store = getStore();
  const row = store.get(input.id);
  if (!row) return null;
  store.delete(input.id);

  if (row.expiresAt <= now) return null;
  if (row.walletAddress !== input.walletAddress) return null;
  if (row.walletProvider !== input.walletProvider) return null;
  if (row.clientIp !== input.clientIp) return null;
  return row;
}
