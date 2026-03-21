import { MARKETPLACE_EVENT, STORAGE_KEYS } from "@/lib/constants";
import { executeMarketplacePayment } from "@/lib/stellar-payments";
import type { StellarNetwork } from "@/lib/stellar";
import { normalizeSafeText, toSafeMediaUrlOrUndefined } from "@/lib/security";
import { readLocalStorage, writeLocalStorage } from "@/lib/storage";
import type { WalletProviderId } from "@/lib/wallet";
import type { AppUser } from "@/types/auth";
import type { AssetMediaItem, ChatMessage, ChatThread, PurchaseRecord, TokenizedAsset } from "@/types/market";

interface BlendSnapshot {
  grossVolume: number;
  sentToBlend: number;
  reserveForPayouts: number;
  cycle: string;
}


interface MarketplaceStateResponse {
  ok: boolean;
  message?: string;
  assets?: TokenizedAsset[];
  purchases?: PurchaseRecord[];
  threads?: ChatThread[];
  messages?: ChatMessage[];
  blendSnapshot?: BlendSnapshot;
}

let volatileAssets: TokenizedAsset[] = [];
let volatilePurchases: PurchaseRecord[] = [];
let volatileThreads: ChatThread[] = [];
let volatileMessages: ChatMessage[] = [];
let volatileBlendSnapshot: BlendSnapshot | null = null;
let latestMarketplaceSyncRequest = 0;

function emitMarketUpdate() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(MARKETPLACE_EVENT));
}

function resolveNextAssets(incoming?: TokenizedAsset[]) {
  if (!incoming) return undefined;
  if (incoming.length > 0) return incoming;
  if (volatileAssets.length > 0) {
    return volatileAssets;
  }
  return incoming;
}

async function parseResponse<T>(response: Response): Promise<T | null> {
  const raw = await response.text();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function fetchMarketplaceState(query: string) {
  const url = `/api/marketplace${query}`;
  try {
    return await fetch(url, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });
  } catch {
    // Retry once with cache-buster to reduce transient browser/proxy failures.
    const separator = query ? "&" : "?";
    return fetch(`${url}${separator}_ts=${Date.now()}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });
  }
}

function writeMarketplaceState(state: {
  assets?: TokenizedAsset[];
  purchases?: PurchaseRecord[];
  threads?: ChatThread[];
  messages?: ChatMessage[];
  blendSnapshot?: BlendSnapshot;
}, options?: { emitEvent?: boolean }) {
  const nextAssets = resolveNextAssets(state.assets);
  if (nextAssets) {
    volatileAssets = nextAssets;
    try { writeLocalStorage(STORAGE_KEYS.assets, nextAssets); } catch {}
  }
  if (state.purchases) {
    volatilePurchases = state.purchases;
    try { writeLocalStorage(STORAGE_KEYS.purchases, state.purchases); } catch {}
  }
  if (state.threads) {
    volatileThreads = state.threads;
    try { writeLocalStorage(STORAGE_KEYS.chatThreads, state.threads); } catch {}
  }
  if (state.messages) {
    volatileMessages = state.messages;
    try { writeLocalStorage(STORAGE_KEYS.chatMessages, state.messages); } catch {}
  }
  if (state.blendSnapshot) {
    volatileBlendSnapshot = state.blendSnapshot;
    try { writeLocalStorage(STORAGE_KEYS.blendSnapshot, state.blendSnapshot); } catch {}
  }
  if (options?.emitEvent ?? true) {
    emitMarketUpdate();
  }
}

export async function syncMarketplace(_userId?: string, options?: { includeChat?: boolean }) {
  const requestId = latestMarketplaceSyncRequest + 1;
  latestMarketplaceSyncRequest = requestId;
  const params = new URLSearchParams();
  if (options?.includeChat) {
    params.set("includeChat", "1");
  }
  const query = params.toString() ? `?${params.toString()}` : "";
  const response = await fetchMarketplaceState(query);
  const payload = await parseResponse<MarketplaceStateResponse>(response);
  if (!payload || !payload.ok) {
    throw new Error(payload?.message ?? "No se pudo sincronizar marketplace.");
  }
  if (requestId !== latestMarketplaceSyncRequest) {
    return payload;
  }
  writeMarketplaceState({
    assets: payload.assets ?? [],
    purchases: payload.purchases ?? [],
    threads: payload.threads ?? [],
    messages: payload.messages ?? [],
    blendSnapshot: payload.blendSnapshot,
  }, { emitEvent: false });
  return payload;
}

export function getAssets() {
  const assets = volatileAssets.length > 0 ? volatileAssets : readLocalStorage<TokenizedAsset[]>(STORAGE_KEYS.assets, []);
  if (volatileAssets.length === 0 && assets.length > 0) {
    volatileAssets = assets;
  }
  const dedupedById = new Map<string, TokenizedAsset>();
  for (const asset of assets) {
    const current = dedupedById.get(asset.id);
    if (!current || +new Date(asset.createdAt) >= +new Date(current.createdAt)) {
      dedupedById.set(asset.id, asset);
    }
  }
  return Array.from(dedupedById.values()).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

export function getPurchases() {
  if (volatilePurchases.length > 0) return volatilePurchases;
  const purchases = readLocalStorage<PurchaseRecord[]>(STORAGE_KEYS.purchases, []);
  if (purchases.length > 0) volatilePurchases = purchases;
  return purchases;
}

export function getThreads() {
  if (volatileThreads.length > 0) return volatileThreads;
  const threads = readLocalStorage<ChatThread[]>(STORAGE_KEYS.chatThreads, []);
  if (threads.length > 0) volatileThreads = threads;
  return threads;
}

function dedupeThreadsByParticipants(threads: ChatThread[]) {
  const byPair = new Map<string, ChatThread>();
  for (const thread of threads) {
    const pairKey = `${thread.buyerId}::${thread.sellerId}`;
    const current = byPair.get(pairKey);
    if (!current || +new Date(thread.updatedAt) >= +new Date(current.updatedAt)) {
      byPair.set(pairKey, thread);
    }
  }
  return Array.from(byPair.values());
}

export function getMessages() {
  if (volatileMessages.length > 0) return volatileMessages;
  const messages = readLocalStorage<ChatMessage[]>(STORAGE_KEYS.chatMessages, []);
  if (messages.length > 0) volatileMessages = messages;
  return messages;
}

export async function createAsset(
  seller: AppUser,
  input: {
    title: string;
    category: TokenizedAsset["category"];
    description: string;
    location: string;
    tokenPriceSats: number;
    totalTokens: number;
    cycleDurationDays: 30 | 60 | 90;
    estimatedApyBps: number;
    historicalRoiBps: number;
    expectedYield: string;
    proofOfAssetHash?: string;
    imageUrl?: string;
    imageUrls?: string[];
    videoUrl?: string;
    mediaGallery?: AssetMediaItem[];
  },
) {
  const title = normalizeSafeText(input.title, 120);
  const description = normalizeSafeText(input.description, 500);
  const location = normalizeSafeText(input.location, 80);
  const expectedYield = normalizeSafeText(input.expectedYield, 80);
  const safeImageUrl = toSafeMediaUrlOrUndefined(input.imageUrl);
  const safeVideoUrl = toSafeMediaUrlOrUndefined(input.videoUrl);
  const safeGallery = (input.imageUrls ?? []).map((url) => toSafeMediaUrlOrUndefined(url)).filter(Boolean) as string[];
  const safeMediaGallery = (input.mediaGallery ?? [])
    .map((item) => {
      const url = toSafeMediaUrlOrUndefined(item.url);
      if (!url) return null;
      return { id: item.id, kind: item.kind, url };
    })
    .filter((item): item is AssetMediaItem => Boolean(item));
  const tokenPriceSats = Number(input.tokenPriceSats);
  const totalTokens = Math.floor(Number(input.totalTokens));
  const estimatedApyBps = Math.floor(Number(input.estimatedApyBps));
  const historicalRoiBps = Math.floor(Number(input.historicalRoiBps));
  const cycleDurationDays = input.cycleDurationDays;
  const proofOfAssetHash = normalizeSafeText(input.proofOfAssetHash ?? "", 160);

  if (!title || !description || !location || !expectedYield) {
    throw new Error("Los campos del activo contienen valores invalidos.");
  }
  if (!Number.isFinite(tokenPriceSats) || !Number.isFinite(totalTokens) || tokenPriceSats <= 0 || totalTokens <= 0) {
    throw new Error("Precio y tokens deben ser numericos y mayores a 0.");
  }
  if (![30, 60, 90].includes(cycleDurationDays)) {
    throw new Error("La duracion del ciclo debe ser de 30, 60 o 90 dias.");
  }

  const response = await fetch("/api/marketplace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "createAsset",
      title,
      category: input.category,
      description,
      location,
      pricePerToken: tokenPriceSats,
      tokenPriceSats,
      totalTokens,
      cycleDurationDays,
      estimatedApyBps,
      historicalRoiBps,
      expectedYield,
      proofOfAssetHash,
      imageUrl: safeImageUrl,
      imageUrls: safeGallery,
      videoUrl: safeVideoUrl,
      mediaGallery: safeMediaGallery,
    }),
  });

  const payload = await parseResponse<{ ok: boolean; asset?: TokenizedAsset; message?: string }>(response);
  if (!payload || !payload.ok || !payload.asset) {
    throw new Error(payload?.message ?? "No se pudo publicar el activo.");
  }

  await syncMarketplace(seller.id);
  return payload.asset;
}

export async function updateAsset(
  seller: AppUser,
  assetId: string,
  input: {
    title: string;
    category: TokenizedAsset["category"];
    description: string;
    location: string;
    tokenPriceSats: number;
    totalTokens: number;
    cycleDurationDays: 30 | 60 | 90;
    estimatedApyBps: number;
    historicalRoiBps: number;
    expectedYield: string;
    proofOfAssetHash?: string;
    imageUrl?: string;
    imageUrls?: string[];
    videoUrl?: string;
    mediaGallery?: AssetMediaItem[];
  },
) {
  const title = normalizeSafeText(input.title, 120);
  const description = normalizeSafeText(input.description, 500);
  const location = normalizeSafeText(input.location, 80);
  const expectedYield = normalizeSafeText(input.expectedYield, 80);
  const safeImageUrl = toSafeMediaUrlOrUndefined(input.imageUrl);
  const safeVideoUrl = toSafeMediaUrlOrUndefined(input.videoUrl);
  const safeGallery = (input.imageUrls ?? []).map((url) => toSafeMediaUrlOrUndefined(url)).filter(Boolean) as string[];
  const safeMediaGallery = (input.mediaGallery ?? [])
    .map((item) => {
      const url = toSafeMediaUrlOrUndefined(item.url);
      if (!url) return null;
      return { id: item.id, kind: item.kind, url };
    })
    .filter((item): item is AssetMediaItem => Boolean(item));
  const tokenPriceSats = Number(input.tokenPriceSats);
  const totalTokens = Math.floor(Number(input.totalTokens));
  const estimatedApyBps = Math.floor(Number(input.estimatedApyBps));
  const historicalRoiBps = Math.floor(Number(input.historicalRoiBps));
  const cycleDurationDays = input.cycleDurationDays;
  const proofOfAssetHash = normalizeSafeText(input.proofOfAssetHash ?? "", 160);

  if (!title || !description || !location || !expectedYield) {
    throw new Error("Los campos del activo contienen valores invalidos.");
  }
  if (!Number.isFinite(tokenPriceSats) || !Number.isFinite(totalTokens) || tokenPriceSats <= 0 || totalTokens <= 0) {
    throw new Error("Precio y tokens deben ser numericos y mayores a 0.");
  }
  if (![30, 60, 90].includes(cycleDurationDays)) {
    throw new Error("La duracion del ciclo debe ser de 30, 60 o 90 dias.");
  }

  const response = await fetch("/api/marketplace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "updateAsset",
      assetId,
      title,
      category: input.category,
      description,
      location,
      pricePerToken: tokenPriceSats,
      tokenPriceSats,
      totalTokens,
      cycleDurationDays,
      estimatedApyBps,
      historicalRoiBps,
      expectedYield,
      proofOfAssetHash,
      imageUrl: safeImageUrl,
      imageUrls: safeGallery,
      videoUrl: safeVideoUrl,
      mediaGallery: safeMediaGallery,
    }),
  });

  const payload = await parseResponse<{ ok: boolean; asset?: TokenizedAsset; message?: string }>(response);
  if (!payload || !payload.ok || !payload.asset) {
    throw new Error(payload?.message ?? "No se pudo editar el activo.");
  }

  await syncMarketplace(seller.id);
  return payload.asset;
}

export async function deleteAsset(seller: AppUser, assetId: string) {
  const response = await fetch("/api/marketplace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "deleteAsset",
      assetId,
    }),
  });
  const payload = await parseResponse<{ ok: boolean; message?: string }>(response);
  if (!payload || !payload.ok) {
    return { ok: false as const, message: payload?.message ?? "No se pudo eliminar el activo." };
  }
  await syncMarketplace(seller.id);
  return { ok: true as const };
}

export async function buyAsset(
  asset: TokenizedAsset,
  buyer: AppUser,
  quantity: number,
  payment: {
    walletAddress: string | null;
    walletProvider: WalletProviderId | null;
    network: StellarNetwork;
  },
) {
  const normalizedQuantity = Math.floor(quantity);
  if (!Number.isInteger(normalizedQuantity) || normalizedQuantity <= 0) {
    return { ok: false as const, message: "La cantidad debe ser mayor a 0." };
  }
  const isPrivilegedTestnetBuyer =
    payment.network === "testnet"
    && (buyer.appRole === "admin" || buyer.appRole === "dev");
  const buyerWallet = payment.walletAddress?.trim() ?? "";
  if (!isPrivilegedTestnetBuyer && !buyerWallet) {
    return { ok: false as const, message: "Conecta una wallet para firmar la transaccion." };
  }
  const sellerWallet = asset.sellerStellarPublicKey?.trim() ?? "";
  if (!sellerWallet) {
    return { ok: false as const, message: "El vendedor no tiene wallet Stellar configurada." };
  }
  if (!isPrivilegedTestnetBuyer && !payment.walletProvider) {
    return { ok: false as const, message: "No se detecto proveedor de wallet para firmar." };
  }

  const totalToPay = Number(asset.tokenPriceSats) * normalizedQuantity;
  const paymentResult = isPrivilegedTestnetBuyer
    ? { ok: true as const, txHash: undefined }
    : await executeMarketplacePayment({
      provider: payment.walletProvider!,
      sourceAddress: buyerWallet,
      destinationAddress: sellerWallet,
      amount: totalToPay,
      network: payment.network,
    });
  if (!paymentResult.ok) {
    return { ok: false as const, message: paymentResult.message };
  }

  const response = await fetch("/api/marketplace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "buyAsset",
      assetId: asset.id,
      quantity: normalizedQuantity,
      stellarTxHash: paymentResult.txHash,
      stellarNetwork: payment.network,
      skipStellarPayment: isPrivilegedTestnetBuyer,
    }),
  });

  const payload = await parseResponse<{ ok: boolean; purchase?: PurchaseRecord; message?: string }>(response);
  if (!payload || !payload.ok || !payload.purchase) {
    return { ok: false as const, message: payload?.message ?? `Pago enviado pero compra no registrada. Hash: ${paymentResult.txHash}` };
  }

  await syncMarketplace(buyer.id);
  return { ok: true as const, purchase: payload.purchase };
}

export async function ensureBuyerThreadForAsset(assetId: string) {
  const response = await fetch("/api/marketplace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "ensureThread",
      assetId,
    }),
  });
  const payload = await parseResponse<{ ok: boolean; message?: string; thread?: ChatThread }>(response);
  if (!payload || !payload.ok || !payload.thread) {
    return { ok: false as const, message: payload?.message ?? "No se pudo abrir el chat." };
  }

  const threads = getThreads();
  const exists = threads.some((thread) => thread.id === payload.thread!.id);
  if (!exists) {
    writeLocalStorage(STORAGE_KEYS.chatThreads, [payload.thread, ...threads]);
    emitMarketUpdate();
  }

  return { ok: true as const, thread: payload.thread, created: !exists };
}

export function getBuyerPortfolio(buyerId: string) {
  const assetsMap = new Map(getAssets().map((asset) => [asset.id, asset]));
  return getPurchases()
    .filter((purchase) => purchase.buyerId === buyerId)
    .map((purchase) => ({
      purchase,
      asset: assetsMap.get(purchase.assetId),
    }))
    .filter((row) => Boolean(row.asset));
}

export function getBuyerPortfolioSummaryByAsset(buyerId: string) {
  const purchases = getPurchases().filter((purchase) => purchase.buyerId === buyerId);
  const assetsById = new Map(getAssets().map((asset) => [asset.id, asset]));
  const grouped = new Map<string, { invested: number; tokens: number; purchases: number }>();

  for (const purchase of purchases) {
    const prev = grouped.get(purchase.assetId) ?? { invested: 0, tokens: 0, purchases: 0 };
    prev.invested += purchase.totalPaid;
    prev.tokens += purchase.quantity;
    prev.purchases += 1;
    grouped.set(purchase.assetId, prev);
  }

  return Array.from(grouped.entries())
    .map(([assetId, stats]) => {
      const asset = assetsById.get(assetId);
      if (!asset) return null;
      const participationPct = (stats.tokens / Math.max(1, asset.totalTokens)) * 100;
      const netProfit = asset.netProfitSats ?? 0;
      const projectedUserProfit = (stats.tokens / Math.max(1, asset.totalTokens)) * netProfit;
      return {
        asset,
        tokensOwned: stats.tokens,
        investedUsdt: stats.invested,
        purchasesCount: stats.purchases,
        participationPct,
        projectedUserProfit,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((a, b) => b.investedUsdt - a.investedUsdt);
}

export function getSellerAssetPerformance(sellerId: string) {
  const assets = getSellerAssets(sellerId);
  const purchases = getPurchases().filter((purchase) => purchase.sellerId === sellerId);

  return assets.map((asset) => {
    const rows = purchases.filter((purchase) => purchase.assetId === asset.id);
    const soldTokens = rows.reduce((sum, row) => sum + row.quantity, 0);
    const grossUsdt = rows.reduce((sum, row) => sum + row.totalPaid, 0);
    const uniqueBuyers = new Set(rows.map((row) => row.buyerId)).size;
    return {
      asset,
      soldTokens,
      grossUsdt,
      uniqueBuyers,
      fillRatePct: (soldTokens / Math.max(1, asset.totalTokens)) * 100,
    };
  });
}

export function getSellerAssets(sellerId: string) {
  return getAssets().filter((asset) => asset.sellerId === sellerId);
}

export function getSellerSalesSummary(sellerId: string) {
  const sellerPurchases = getPurchases().filter((purchase) => purchase.sellerId === sellerId);
  return {
    soldTokens: sellerPurchases.reduce((sum, purchase) => sum + purchase.quantity, 0),
    grossAmount: sellerPurchases.reduce((sum, purchase) => sum + purchase.totalPaid, 0),
    operations: sellerPurchases.length,
  };
}

export function getBlendLiquiditySnapshot() {
  const snapshot = volatileBlendSnapshot ?? readLocalStorage<BlendSnapshot | null>(STORAGE_KEYS.blendSnapshot, null);
  if (snapshot) return snapshot;

  const purchases = getPurchases();
  const grossVolume = purchases.reduce((sum, purchase) => sum + purchase.totalPaid, 0);
  return {
    grossVolume,
    sentToBlend: Math.floor(grossVolume * 0.8),
    reserveForPayouts: Math.ceil(grossVolume * 0.2),
    cycle: "mensual o bimestral",
  };
}

export function getSellerThreads(sellerId: string) {
  return dedupeThreadsByParticipants(getThreads()
    .filter((thread) => thread.sellerId === sellerId)
  )
    .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
}

export function getBuyerThreads(buyerId: string) {
  return dedupeThreadsByParticipants(getThreads()
    .filter((thread) => thread.buyerId === buyerId)
  )
    .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
}

export function getThreadMessages(threadId: string) {
  return getMessages()
    .filter((message) => message.threadId === threadId)
    .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
}

export function getUserThreads(userId: string) {
  return dedupeThreadsByParticipants(getThreads()
    .filter((thread) => thread.buyerId === userId || thread.sellerId === userId)
  )
    .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
}

export function getThreadRoleForUser(thread: ChatThread, userId: string): "buyer" | "seller" | null {
  if (thread.buyerId === userId) return "buyer";
  if (thread.sellerId === userId) return "seller";
  return null;
}

export async function markThreadMessagesRead(threadId: string, readerRole: "buyer" | "seller") {
  const response = await fetch("/api/marketplace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "markRead",
      threadId,
    }),
  });
  const payload = await parseResponse<{ ok: boolean; changed?: boolean; message?: string }>(response);
  if (!payload || !payload.ok || !payload.changed) return false;

  const messages = getMessages();
  const now = new Date().toISOString();
  const next = messages.map((message) => {
    if (message.threadId !== threadId) return message;
    if (message.senderRole === readerRole) return message;
    if (message.status === "read" || message.status === "failed") return message;
    return { ...message, status: "read" as const, readAt: now };
  });
  volatileMessages = next;
  try { writeLocalStorage(STORAGE_KEYS.chatMessages, next); } catch {}
  emitMarketUpdate();
  return true;
}

export async function sendThreadMessage(
  threadId: string,
  sender: AppUser,
  _senderRole: "buyer" | "seller",
  text: string,
  options?: {
    kind?: "text" | "image" | "video" | "audio" | "document";
    attachment?: {
      name: string;
      mimeType: string;
      size: number;
      dataUrl: string;
    };
  },
) {
  const messageText = normalizeSafeText(text, 500);
  const messageKind = options?.kind ?? "text";
  const hasAttachment = Boolean(options?.attachment);

  if (!messageText && !hasAttachment) {
    return { ok: false as const, message: "Escribe un mensaje." };
  }

  const response = await fetch("/api/marketplace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "sendMessage",
      threadId,
      text: messageText,
      kind: messageKind,
      attachment: options?.attachment,
    }),
  });

  const payload = await parseResponse<
    | { ok: true; message: ChatMessage }
    | { ok: false; message?: string }
  >(response);
  if (!payload || !payload.ok) {
    return { ok: false as const, message: payload?.message ?? "No se pudo enviar el mensaje." };
  }

  const receivedMessage = payload.message;

  try {
    const messages = getMessages();
    messages.push(receivedMessage);
    volatileMessages = messages;
    writeLocalStorage(STORAGE_KEYS.chatMessages, messages);

    const threads = getThreads();
    const thread = threads.find((item) => item.id === threadId);
    if (thread) {
      thread.updatedAt = receivedMessage.createdAt;
      volatileThreads = threads;
      writeLocalStorage(STORAGE_KEYS.chatThreads, threads);
    }
  } catch {
    // Si localStorage alcanza cuota (adjuntos pesados), no romper envio ya persistido en backend.
  }

  emitMarketUpdate();
  return { ok: true as const, status: "sent" as const };
}

export async function deleteThreadMessages(
  threadId: string,
  actor: AppUser,
  messageIds: string[],
  mode: "me" | "everyone",
) {
  const uniqueIds = Array.from(new Set(messageIds.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return { ok: false as const, message: "No hay mensajes seleccionados." };
  }

  const response = await fetch("/api/marketplace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "deleteMessages",
      threadId,
      messageIds: uniqueIds,
      mode,
    }),
  });

  const payload = await parseResponse<
    | { ok: true; deletedIds: string[]; notAllowedIds: string[] }
    | { ok: false; message?: string }
  >(response);

  if (!payload || !payload.ok) {
    return { ok: false as const, message: payload?.message ?? "No se pudieron eliminar los mensajes." };
  }

  const deletedSet = new Set(payload.deletedIds);
  const messages = getMessages();
  const next = mode === "me"
    ? messages.filter((message) => !deletedSet.has(message.id))
    : messages.map((message) => {
      if (!deletedSet.has(message.id)) return message;
      return {
        ...message,
        text: "",
        kind: "text" as const,
        attachment: undefined,
        deletedForEveryone: true,
        deletedForEveryoneBy: actor.id,
        deletedForEveryoneAt: new Date().toISOString(),
      };
    });

  volatileMessages = next;
  try { writeLocalStorage(STORAGE_KEYS.chatMessages, next); } catch {}
  emitMarketUpdate();

  return { ok: true as const, deletedIds: payload.deletedIds, notAllowedIds: payload.notAllowedIds };
}

export function appendFailedThreadMessage(
  threadId: string,
  sender: AppUser,
  senderRole: "buyer" | "seller",
  text: string,
  errorMessage: string,
  options?: {
    kind?: "text" | "image" | "video" | "audio" | "document";
    attachment?: {
      name: string;
      mimeType: string;
      size: number;
      dataUrl: string;
    };
  },
) {
  const threads = getThreads();
  const thread = threads.find((item) => item.id === threadId);
  if (!thread) return false;

  const messages = getMessages();
  const createdAt = new Date().toISOString();
  messages.push({
    id: crypto.randomUUID(),
    threadId,
    senderId: sender.id,
    senderName: sender.fullName,
    senderRole,
    text: normalizeSafeText(text || "No se pudo enviar el mensaje.", 500),
    status: "failed",
    kind: options?.kind ?? "text",
    attachment: options?.attachment,
    errorMessage: normalizeSafeText(errorMessage, 140),
    createdAt,
  });

  thread.updatedAt = createdAt;
  volatileMessages = messages;
  volatileThreads = threads;
  try { writeLocalStorage(STORAGE_KEYS.chatMessages, messages); } catch {}
  try { writeLocalStorage(STORAGE_KEYS.chatThreads, threads); } catch {}
  emitMarketUpdate();
  return true;
}
