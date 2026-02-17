import { MARKETPLACE_EVENT, STORAGE_KEYS } from "@/lib/constants";
import { normalizeSafeText, toSafeHttpUrlOrUndefined } from "@/lib/security";
import { readLocalStorage, writeLocalStorage } from "@/lib/storage";
import type { AppUser } from "@/types/auth";
import type { ChatMessage, ChatThread, PurchaseRecord, TokenizedAsset } from "@/types/market";

interface BlendSnapshot {
  grossVolume: number;
  sentToBlend: number;
  reserveForPayouts: number;
  cycle: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface MarketplaceStateResponse {
  ok: boolean;
  message?: string;
  assets?: TokenizedAsset[];
  purchases?: PurchaseRecord[];
  threads?: ChatThread[];
  messages?: ChatMessage[];
  blendSnapshot?: BlendSnapshot;
}

function emitMarketUpdate() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(MARKETPLACE_EVENT));
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

function writeMarketplaceState(state: {
  assets?: TokenizedAsset[];
  purchases?: PurchaseRecord[];
  threads?: ChatThread[];
  messages?: ChatMessage[];
  blendSnapshot?: BlendSnapshot;
}) {
  if (state.assets) writeLocalStorage(STORAGE_KEYS.assets, state.assets);
  if (state.purchases) writeLocalStorage(STORAGE_KEYS.purchases, state.purchases);
  if (state.threads) writeLocalStorage(STORAGE_KEYS.chatThreads, state.threads);
  if (state.messages) writeLocalStorage(STORAGE_KEYS.chatMessages, state.messages);
  if (state.blendSnapshot) writeLocalStorage(STORAGE_KEYS.blendSnapshot, state.blendSnapshot);
  emitMarketUpdate();
}

export async function syncMarketplace(userId?: string, options?: { includeChat?: boolean }) {
  const params = new URLSearchParams();
  if (userId && UUID_REGEX.test(userId)) {
    params.set("userId", userId);
  }
  if (options?.includeChat) {
    params.set("includeChat", "1");
  }
  const query = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(`/api/marketplace${query}`);
  const payload = await parseResponse<MarketplaceStateResponse>(response);
  if (!payload || !payload.ok) {
    throw new Error(payload?.message ?? "No se pudo sincronizar marketplace.");
  }
  writeMarketplaceState({
    assets: payload.assets ?? [],
    purchases: payload.purchases ?? [],
    threads: payload.threads ?? [],
    messages: payload.messages ?? [],
    blendSnapshot: payload.blendSnapshot,
  });
  return payload;
}

export function getAssets() {
  const assets = readLocalStorage<TokenizedAsset[]>(STORAGE_KEYS.assets, []);
  return [...assets].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

export function getPurchases() {
  return readLocalStorage<PurchaseRecord[]>(STORAGE_KEYS.purchases, []);
}

export function getThreads() {
  return readLocalStorage<ChatThread[]>(STORAGE_KEYS.chatThreads, []);
}

export function getMessages() {
  return readLocalStorage<ChatMessage[]>(STORAGE_KEYS.chatMessages, []);
}

export async function createAsset(
  seller: AppUser,
  input: {
    title: string;
    category: TokenizedAsset["category"];
    description: string;
    location: string;
    pricePerToken: number;
    totalTokens: number;
    expectedYield: string;
    imageUrl?: string;
    imageUrls?: string[];
    videoUrl?: string;
  },
) {
  const title = normalizeSafeText(input.title, 120);
  const description = normalizeSafeText(input.description, 500);
  const location = normalizeSafeText(input.location, 80);
  const expectedYield = normalizeSafeText(input.expectedYield, 80);
  const safeImageUrl = toSafeHttpUrlOrUndefined(input.imageUrl);
  const safeVideoUrl = toSafeHttpUrlOrUndefined(input.videoUrl);
  const safeGallery = (input.imageUrls ?? []).map((url) => toSafeHttpUrlOrUndefined(url)).filter(Boolean) as string[];
  const pricePerToken = Number(input.pricePerToken);
  const totalTokens = Math.floor(Number(input.totalTokens));

  if (!title || !description || !location || !expectedYield) {
    throw new Error("Los campos del activo contienen valores invalidos.");
  }
  if (!Number.isFinite(pricePerToken) || !Number.isFinite(totalTokens) || pricePerToken <= 0 || totalTokens <= 0) {
    throw new Error("Precio y tokens deben ser numericos y mayores a 0.");
  }

  const response = await fetch("/api/marketplace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "createAsset",
      sellerId: seller.id,
      sellerName: seller.organization || seller.fullName,
      title,
      category: input.category,
      description,
      location,
      pricePerToken,
      totalTokens,
      expectedYield,
      imageUrl: safeImageUrl,
      imageUrls: safeGallery,
      videoUrl: safeVideoUrl,
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
    pricePerToken: number;
    totalTokens: number;
    expectedYield: string;
    imageUrl?: string;
    imageUrls?: string[];
    videoUrl?: string;
  },
) {
  const title = normalizeSafeText(input.title, 120);
  const description = normalizeSafeText(input.description, 500);
  const location = normalizeSafeText(input.location, 80);
  const expectedYield = normalizeSafeText(input.expectedYield, 80);
  const safeImageUrl = toSafeHttpUrlOrUndefined(input.imageUrl);
  const safeVideoUrl = toSafeHttpUrlOrUndefined(input.videoUrl);
  const safeGallery = (input.imageUrls ?? []).map((url) => toSafeHttpUrlOrUndefined(url)).filter(Boolean) as string[];
  const pricePerToken = Number(input.pricePerToken);
  const totalTokens = Math.floor(Number(input.totalTokens));

  if (!title || !description || !location || !expectedYield) {
    throw new Error("Los campos del activo contienen valores invalidos.");
  }
  if (!Number.isFinite(pricePerToken) || !Number.isFinite(totalTokens) || pricePerToken <= 0 || totalTokens <= 0) {
    throw new Error("Precio y tokens deben ser numericos y mayores a 0.");
  }

  const response = await fetch("/api/marketplace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "updateAsset",
      assetId,
      sellerId: seller.id,
      sellerName: seller.organization || seller.fullName,
      title,
      category: input.category,
      description,
      location,
      pricePerToken,
      totalTokens,
      expectedYield,
      imageUrl: safeImageUrl,
      imageUrls: safeGallery,
      videoUrl: safeVideoUrl,
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
      sellerId: seller.id,
    }),
  });
  const payload = await parseResponse<{ ok: boolean; message?: string }>(response);
  if (!payload || !payload.ok) {
    return { ok: false as const, message: payload?.message ?? "No se pudo eliminar el activo." };
  }
  await syncMarketplace(seller.id);
  return { ok: true as const };
}

export async function buyAsset(assetId: string, buyer: AppUser, quantity: number) {
  const normalizedQuantity = Math.floor(quantity);
  if (!Number.isInteger(normalizedQuantity) || normalizedQuantity <= 0) {
    return { ok: false as const, message: "La cantidad debe ser mayor a 0." };
  }

  const response = await fetch("/api/marketplace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "buyAsset",
      assetId,
      buyerId: buyer.id,
      buyerName: buyer.fullName,
      quantity: normalizedQuantity,
    }),
  });

  const payload = await parseResponse<{ ok: boolean; purchase?: PurchaseRecord; message?: string }>(response);
  if (!payload || !payload.ok || !payload.purchase) {
    return { ok: false as const, message: payload?.message ?? "No se pudo completar la compra." };
  }

  await syncMarketplace(buyer.id);
  return { ok: true as const, purchase: payload.purchase };
}

export async function ensureBuyerThreadForAsset(assetId: string, buyer: AppUser) {
  const response = await fetch("/api/marketplace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "ensureThread",
      assetId,
      buyerId: buyer.id,
      buyerName: buyer.fullName,
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
  const snapshot = readLocalStorage<BlendSnapshot | null>(STORAGE_KEYS.blendSnapshot, null);
  if (snapshot) return snapshot;

  const purchases = getPurchases();
  const grossVolume = purchases.reduce((sum, purchase) => sum + purchase.totalPaid, 0);
  return {
    grossVolume,
    sentToBlend: grossVolume * 0.8,
    reserveForPayouts: grossVolume * 0.2,
    cycle: "mensual o bimestral",
  };
}

export function getSellerThreads(sellerId: string) {
  return getThreads()
    .filter((thread) => thread.sellerId === sellerId)
    .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
}

export function getBuyerThreads(buyerId: string) {
  return getThreads()
    .filter((thread) => thread.buyerId === buyerId)
    .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
}

export function getThreadMessages(threadId: string) {
  return getMessages()
    .filter((message) => message.threadId === threadId)
    .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
}

export function getUserThreads(userId: string) {
  return getThreads()
    .filter((thread) => thread.buyerId === userId || thread.sellerId === userId)
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
      readerRole,
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
  writeLocalStorage(STORAGE_KEYS.chatMessages, next);
  emitMarketUpdate();
  return true;
}

export async function sendThreadMessage(
  threadId: string,
  sender: AppUser,
  senderRole: "buyer" | "seller",
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
      senderId: sender.id,
      senderName: sender.fullName,
      senderRole,
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

  const messages = getMessages();
  messages.push(receivedMessage);
  writeLocalStorage(STORAGE_KEYS.chatMessages, messages);

  const threads = getThreads();
  const thread = threads.find((item) => item.id === threadId);
  if (thread) {
    thread.updatedAt = receivedMessage.createdAt;
    writeLocalStorage(STORAGE_KEYS.chatThreads, threads);
  }

  emitMarketUpdate();
  return { ok: true as const, status: "sent" as const };
}

export function appendFailedThreadMessage(
  threadId: string,
  sender: AppUser,
  senderRole: "buyer" | "seller",
  text: string,
  errorMessage: string,
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
    kind: "text",
    errorMessage: normalizeSafeText(errorMessage, 140),
    createdAt,
  });

  thread.updatedAt = createdAt;
  writeLocalStorage(STORAGE_KEYS.chatMessages, messages);
  writeLocalStorage(STORAGE_KEYS.chatThreads, threads);
  emitMarketUpdate();
  return true;
}
