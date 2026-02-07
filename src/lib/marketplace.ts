import { MARKETPLACE_EVENT, STORAGE_KEYS } from "@/lib/constants";
import { normalizeSafeText, toSafeHttpUrlOrUndefined } from "@/lib/security";
import { readLocalStorage, writeLocalStorage } from "@/lib/storage";
import type { AppUser } from "@/types/auth";
import type { ChatMessage, ChatThread, PurchaseRecord, TokenizedAsset } from "@/types/market";

const seedAssets: TokenizedAsset[] = [
  {
    id: "asset-seed-1",
    title: "Token Soja Premium 2026",
    category: "cultivo",
    description: "Participacion en campana de soja con trazabilidad de insumos y cosecha.",
    location: "Cordoba, AR",
    pricePerToken: 12.5,
    totalTokens: 45000,
    availableTokens: 21800,
    expectedYield: "14.1% anual estimado",
    sellerId: "seller-seed-1",
    sellerName: "Agro Nucleo SA",
    imageUrl: "https://images.unsplash.com/photo-1620147461831-a97b99ade1d3?auto=format&fit=crop&w=1200&q=80",
    createdAt: "2026-01-10T10:00:00.000Z",
  },
  {
    id: "asset-seed-2",
    title: "Token Tierra Productiva Lote Norte",
    category: "tierra",
    description: "Fraccionamiento digital de lote agricola con garantia fiduciaria.",
    location: "Entre Rios, AR",
    pricePerToken: 26,
    totalTokens: 18000,
    availableTokens: 9400,
    expectedYield: "11.2% anual estimado",
    sellerId: "seller-seed-2",
    sellerName: "Campos del Litoral",
    imageUrl: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1200&q=80",
    createdAt: "2026-01-16T10:00:00.000Z",
  },
  {
    id: "asset-seed-3",
    title: "Token Engorde Bovino Delta",
    category: "ganaderia",
    description: "Modelo de engorde con monitoreo veterinario y costos auditables.",
    location: "Santa Fe, AR",
    pricePerToken: 18.75,
    totalTokens: 32000,
    availableTokens: 19750,
    expectedYield: "16.0% anual estimado",
    sellerId: "seller-seed-3",
    sellerName: "Ganadera Delta",
    imageUrl: "https://images.unsplash.com/photo-1527153857715-3908f2bae5e8?auto=format&fit=crop&w=1200&q=80",
    createdAt: "2026-01-21T10:00:00.000Z",
  },
];

function emitMarketUpdate() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(MARKETPLACE_EVENT));
}

function getAssetsRaw() {
  const assets = readLocalStorage<TokenizedAsset[]>(STORAGE_KEYS.assets, []);
  if (assets.length > 0) return assets;

  writeLocalStorage(STORAGE_KEYS.assets, seedAssets);
  return seedAssets;
}

export function getAssets() {
  return [...getAssetsRaw()].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
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

export function createAsset(
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
  const assets = getAssetsRaw();
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

  const newAsset: TokenizedAsset = {
    id: crypto.randomUUID(),
    sellerId: seller.id,
    sellerName: seller.organization || seller.fullName,
    availableTokens: totalTokens,
    createdAt: new Date().toISOString(),
    title,
    category: input.category,
    description,
    location,
    pricePerToken,
    totalTokens,
    expectedYield,
    imageUrl: safeImageUrl,
    imageUrls: safeGallery.length > 0 ? safeGallery : undefined,
    videoUrl: safeVideoUrl,
  };

  assets.push(newAsset);
  writeLocalStorage(STORAGE_KEYS.assets, assets);
  emitMarketUpdate();

  return newAsset;
}

export function buyAsset(assetId: string, buyer: AppUser, quantity: number) {
  const normalizedQuantity = Math.floor(quantity);
  if (!Number.isInteger(normalizedQuantity) || normalizedQuantity <= 0) {
    return { ok: false as const, message: "La cantidad debe ser mayor a 0." };
  }

  const assets = getAssetsRaw();
  const asset = assets.find((item) => item.id === assetId);

  if (!asset) {
    return { ok: false as const, message: "Activo no encontrado." };
  }

  if (asset.availableTokens < normalizedQuantity) {
    return { ok: false as const, message: "No hay suficientes tokens disponibles." };
  }

  asset.availableTokens -= normalizedQuantity;
  writeLocalStorage(STORAGE_KEYS.assets, assets);

  const purchases = getPurchases();
  const purchase: PurchaseRecord = {
    id: crypto.randomUUID(),
    assetId: asset.id,
    buyerId: buyer.id,
    buyerName: buyer.fullName,
    sellerId: asset.sellerId,
    quantity: normalizedQuantity,
    pricePerToken: asset.pricePerToken,
    totalPaid: normalizedQuantity * asset.pricePerToken,
    purchasedAt: new Date().toISOString(),
  };
  purchases.push(purchase);
  writeLocalStorage(STORAGE_KEYS.purchases, purchases);

  const threads = getThreads();
  const existingThread = threads.find((thread) => thread.assetId === asset.id && thread.buyerId === buyer.id && thread.sellerId === asset.sellerId);
  if (!existingThread) {
    threads.push({
      id: crypto.randomUUID(),
      assetId: asset.id,
      buyerId: buyer.id,
      buyerName: buyer.fullName,
      sellerId: asset.sellerId,
      sellerName: asset.sellerName,
      updatedAt: purchase.purchasedAt,
    });
    writeLocalStorage(STORAGE_KEYS.chatThreads, threads);
  }

  emitMarketUpdate();
  return { ok: true as const, purchase };
}

export function getBuyerPortfolio(buyerId: string) {
  const assetsMap = new Map(getAssetsRaw().map((asset) => [asset.id, asset]));
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
  const purchases = getPurchases();
  const grossVolume = purchases.reduce((sum, purchase) => sum + purchase.totalPaid, 0);
  const sentToBlend = grossVolume * 0.8;
  const reserveForPayouts = grossVolume * 0.2;

  return {
    grossVolume,
    sentToBlend,
    reserveForPayouts,
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

export function sendThreadMessage(
  threadId: string,
  sender: AppUser,
  senderRole: "buyer" | "seller",
  text: string,
) {
  const messageText = normalizeSafeText(text, 500);
  if (!messageText) {
    return { ok: false as const, message: "Escribe un mensaje." };
  }

  const threads = getThreads();
  const thread = threads.find((item) => item.id === threadId);
  if (!thread) {
    return { ok: false as const, message: "Conversacion no encontrada." };
  }

  const messages = getMessages();
  messages.push({
    id: crypto.randomUUID(),
    threadId,
    senderId: sender.id,
    senderName: sender.fullName,
    senderRole,
    text: messageText,
    createdAt: new Date().toISOString(),
  });

  thread.updatedAt = new Date().toISOString();

  writeLocalStorage(STORAGE_KEYS.chatMessages, messages);
  writeLocalStorage(STORAGE_KEYS.chatThreads, threads);
  emitMarketUpdate();

  return { ok: true as const };
}

