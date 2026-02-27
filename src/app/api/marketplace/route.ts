import { NextResponse } from "next/server";
import { getDataUrlByteSize, isSafeMediaDataUrl, normalizeSafeText, toSafeMediaUrlOrUndefined } from "@/lib/security";
import { getAuthUserFromRequest } from "@/lib/server/auth-session";
import { enforceRateLimit, isTrustedOrigin, parseJsonWithLimit } from "@/lib/server/request-security";
import {
  buyMarketplaceAsset,
  createMarketplaceAsset,
  deleteMarketplaceAsset,
  deleteMarketplaceMessages,
  ensureMarketplaceThreadForBuyer,
  getMarketplaceState,
  markMarketplaceMessagesRead,
  sendMarketplaceMessage,
  updateMarketplaceAsset,
} from "@/lib/server/marketplace-db";
import type { TokenizedAsset } from "@/types/market";

export const runtime = "nodejs";

const STELLAR_TX_HASH_REGEX = /^[0-9a-f]{64}$/i;
const MAX_GALLERY_ITEMS = 12;
const MAX_MESSAGE_IDS = 200;
const MAX_MARKETPLACE_PAYLOAD_BYTES = 15 * 1024 * 1024;

function isAssetCategory(value: unknown): value is TokenizedAsset["category"] {
  return value === "cultivo" || value === "tierra" || value === "ganaderia";
}

function parseQuantity(raw: unknown) {
  const parsed = Math.floor(Number(raw));
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}

function parsePrice(raw: unknown) {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function parseStringArray(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((value): value is string => typeof value === "string").slice(0, MAX_GALLERY_ITEMS);
}

function parseMediaGallery(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_GALLERY_ITEMS)
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as { id?: unknown; kind?: unknown; url?: unknown };
      if (typeof row.id !== "string" || typeof row.url !== "string") return null;
      if (row.kind !== "image" && row.kind !== "video") return null;
      const normalizedId = normalizeSafeText(row.id, 80);
      if (!normalizedId) return null;
      return { id: normalizedId, kind: row.kind, url: row.url };
    })
    .filter((item): item is { id: string; kind: "image" | "video"; url: string } => Boolean(item));
}

export async function GET(request: Request) {
  const rate = enforceRateLimit({
    request,
    key: "api_marketplace_get",
    max: 120,
    windowMs: 60 * 1000,
  });
  if (!rate.ok) {
    return NextResponse.json({ ok: false, message: "Demasiadas solicitudes. Intenta nuevamente." }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const includeChat = searchParams.get("includeChat") === "1";
  const authUser = await getAuthUserFromRequest();
  const userId = authUser?.id;

  try {
    const state = await getMarketplaceState(userId, { includeChat });
    return NextResponse.json({ ok: true, ...state });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "No se pudo obtener el marketplace." },
      { status: 500 },
    );
  }
}

type CommandPayload =
  | {
    action: "createAsset";
    title?: string;
    category?: unknown;
    description?: string;
    location?: string;
    pricePerToken?: unknown;
    tokenPriceSats?: unknown;
    totalTokens?: unknown;
    cycleDurationDays?: unknown;
    estimatedApyBps?: unknown;
    historicalRoiBps?: unknown;
    expectedYield?: string;
    proofOfAssetHash?: string;
    imageUrl?: string;
    imageUrls?: unknown;
    videoUrl?: string;
    mediaGallery?: unknown;
  }
  | {
    action: "buyAsset";
    assetId?: string;
    quantity?: unknown;
    stellarTxHash?: string;
    stellarNetwork?: unknown;
  }
  | {
    action: "updateAsset";
    assetId?: string;
    title?: string;
    category?: unknown;
    description?: string;
    location?: string;
    pricePerToken?: unknown;
    tokenPriceSats?: unknown;
    totalTokens?: unknown;
    cycleDurationDays?: unknown;
    estimatedApyBps?: unknown;
    historicalRoiBps?: unknown;
    expectedYield?: string;
    proofOfAssetHash?: string;
    imageUrl?: string;
    imageUrls?: unknown;
    videoUrl?: string;
    mediaGallery?: unknown;
  }
  | {
    action: "deleteAsset";
    assetId?: string;
  }
  | {
    action: "ensureThread";
    assetId?: string;
  }
  | {
    action: "sendMessage";
    threadId?: string;
    text?: string;
    kind?: "text" | "image" | "video" | "audio" | "document";
    attachment?: {
      name?: string;
      mimeType?: string;
      size?: number;
      dataUrl?: string;
    };
  }
  | {
    action: "markRead";
    threadId?: string;
  }
  | {
    action: "deleteMessages";
    threadId?: string;
    messageIds?: unknown;
    mode?: "me" | "everyone";
  };

export async function POST(request: Request) {
  if (!isTrustedOrigin(request)) {
    return NextResponse.json({ ok: false, message: "Origen no permitido." }, { status: 403 });
  }
  const rate = enforceRateLimit({
    request,
    key: "api_marketplace_post",
    max: 60,
    windowMs: 60 * 1000,
  });
  if (!rate.ok) {
    return NextResponse.json({ ok: false, message: "Demasiadas solicitudes. Intenta nuevamente." }, { status: 429 });
  }

  const parsed = await parseJsonWithLimit<CommandPayload>(request, MAX_MARKETPLACE_PAYLOAD_BYTES);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, message: parsed.message }, { status: parsed.status });
  }
  const payload = parsed.data;

  try {
    if (payload.action === "createAsset") {
      const authUser = await getAuthUserFromRequest();
      if (!authUser) {
        return NextResponse.json({ ok: false, message: "No autenticado." }, { status: 401 });
      }

      const title = normalizeSafeText(payload.title ?? "", 120);
      const category = payload.category;
      const description = normalizeSafeText(payload.description ?? "", 500);
      const location = normalizeSafeText(payload.location ?? "", 80);
      const expectedYield = normalizeSafeText(payload.expectedYield ?? "", 80);
      const proofOfAssetHash = normalizeSafeText(payload.proofOfAssetHash ?? "", 160);
      const sellerId = authUser.id;
      const sellerName = normalizeSafeText(authUser.fullName ?? "", 120);
      const tokenPriceSats = parsePrice(payload.tokenPriceSats ?? payload.pricePerToken);
      const totalTokens = parseQuantity(payload.totalTokens);
      const cycleDurationDays = parseQuantity(payload.cycleDurationDays);
      const estimatedApyBps = parseQuantity(payload.estimatedApyBps);
      const historicalRoiBps = parseQuantity(payload.historicalRoiBps);
      const imageUrl = toSafeMediaUrlOrUndefined(payload.imageUrl);
      const videoUrl = toSafeMediaUrlOrUndefined(payload.videoUrl);
      const imageUrls = parseStringArray(payload.imageUrls).map((url) => toSafeMediaUrlOrUndefined(url)).filter(Boolean) as string[];
      const mediaGallery = parseMediaGallery(payload.mediaGallery)
        .map((item) => ({ ...item, url: toSafeMediaUrlOrUndefined(item.url) ?? "" }))
        .filter((item) => item.url.length > 0);

      if (!title || !description || !location || !expectedYield || !sellerId || !sellerName || !isAssetCategory(category)) {
        return NextResponse.json({ ok: false, message: "Campos invalidos para crear activo." }, { status: 400 });
      }
      if (!Number.isFinite(tokenPriceSats) || !Number.isFinite(totalTokens) || tokenPriceSats <= 0 || totalTokens <= 0) {
        return NextResponse.json({ ok: false, message: "Precio y tokens deben ser numericos y mayores a 0." }, { status: 400 });
      }
      if (![30, 60, 90].includes(cycleDurationDays)) {
        return NextResponse.json({ ok: false, message: "La duracion del ciclo debe ser de 30, 60 o 90 dias." }, { status: 400 });
      }
      if (!Number.isFinite(estimatedApyBps) || estimatedApyBps < 0 || !Number.isFinite(historicalRoiBps) || historicalRoiBps < 0) {
        return NextResponse.json({ ok: false, message: "APY y ROI historico deben ser enteros positivos." }, { status: 400 });
      }

      const asset = await createMarketplaceAsset({
        sellerId,
        sellerName,
        title,
        category,
        description,
        location,
        pricePerToken: tokenPriceSats,
        tokenPriceSats,
        totalTokens,
        cycleDurationDays: cycleDurationDays as 30 | 60 | 90,
        estimatedApyBps,
        historicalRoiBps,
        expectedYield,
        proofOfAssetHash: proofOfAssetHash || crypto.randomUUID().replace(/-/g, ""),
        imageUrl,
        imageUrls,
        videoUrl,
        mediaGallery,
      });
      return NextResponse.json({ ok: true, asset });
    }

    if (payload.action === "buyAsset") {
      const authUser = await getAuthUserFromRequest();
      if (!authUser) {
        return NextResponse.json({ ok: false, message: "No autenticado." }, { status: 401 });
      }

      const assetId = payload.assetId?.trim() ?? "";
      const buyerId = authUser.id;
      const buyerName = normalizeSafeText(authUser.fullName ?? "", 120);
      const quantity = parseQuantity(payload.quantity);
      const stellarTxHash = payload.stellarTxHash?.trim() ?? "";
      const stellarNetwork = payload.stellarNetwork === "public" ? "public" : payload.stellarNetwork === "testnet" ? "testnet" : null;
      if (!assetId || !buyerId || !buyerName || !Number.isFinite(quantity) || quantity <= 0) {
        return NextResponse.json({ ok: false, message: "Datos invalidos para compra." }, { status: 400 });
      }
      if (!stellarNetwork) {
        return NextResponse.json({ ok: false, message: "Debes especificar la red Stellar de la transaccion." }, { status: 400 });
      }
      if (!STELLAR_TX_HASH_REGEX.test(stellarTxHash)) {
        return NextResponse.json({ ok: false, message: "Hash de transaccion Stellar invalido." }, { status: 400 });
      }

      const result = await buyMarketplaceAsset({
        assetId,
        buyerId,
        buyerName,
        quantity,
        stellarTxHash,
        stellarNetwork,
      });
      if (!result.ok) {
        return NextResponse.json({ ok: false, message: result.message }, { status: 400 });
      }

      return NextResponse.json({ ok: true, purchase: result.purchase, thread: result.thread });
    }

    if (payload.action === "updateAsset") {
      const authUser = await getAuthUserFromRequest();
      if (!authUser) {
        return NextResponse.json({ ok: false, message: "No autenticado." }, { status: 401 });
      }

      const assetId = payload.assetId?.trim() ?? "";
      const sellerId = authUser.id;
      const sellerName = normalizeSafeText(authUser.fullName ?? "", 120);
      const title = normalizeSafeText(payload.title ?? "", 120);
      const category = payload.category;
      const description = normalizeSafeText(payload.description ?? "", 500);
      const location = normalizeSafeText(payload.location ?? "", 80);
      const expectedYield = normalizeSafeText(payload.expectedYield ?? "", 80);
      const proofOfAssetHash = normalizeSafeText(payload.proofOfAssetHash ?? "", 160);
      const tokenPriceSats = parsePrice(payload.tokenPriceSats ?? payload.pricePerToken);
      const totalTokens = parseQuantity(payload.totalTokens);
      const cycleDurationDays = parseQuantity(payload.cycleDurationDays);
      const estimatedApyBps = parseQuantity(payload.estimatedApyBps);
      const historicalRoiBps = parseQuantity(payload.historicalRoiBps);
      const imageUrl = toSafeMediaUrlOrUndefined(payload.imageUrl);
      const videoUrl = toSafeMediaUrlOrUndefined(payload.videoUrl);
      const imageUrls = parseStringArray(payload.imageUrls).map((url) => toSafeMediaUrlOrUndefined(url)).filter(Boolean) as string[];
      const mediaGallery = parseMediaGallery(payload.mediaGallery)
        .map((item) => ({ ...item, url: toSafeMediaUrlOrUndefined(item.url) ?? "" }))
        .filter((item) => item.url.length > 0);

      if (!assetId || !sellerId || !sellerName || !title || !description || !location || !expectedYield || !isAssetCategory(category)) {
        return NextResponse.json({ ok: false, message: "Campos invalidos para editar activo." }, { status: 400 });
      }
      if (!Number.isFinite(tokenPriceSats) || !Number.isFinite(totalTokens) || tokenPriceSats <= 0 || totalTokens <= 0) {
        return NextResponse.json({ ok: false, message: "Precio y tokens deben ser numericos y mayores a 0." }, { status: 400 });
      }
      if (![30, 60, 90].includes(cycleDurationDays)) {
        return NextResponse.json({ ok: false, message: "La duracion del ciclo debe ser de 30, 60 o 90 dias." }, { status: 400 });
      }
      if (!Number.isFinite(estimatedApyBps) || estimatedApyBps < 0 || !Number.isFinite(historicalRoiBps) || historicalRoiBps < 0) {
        return NextResponse.json({ ok: false, message: "APY y ROI historico deben ser enteros positivos." }, { status: 400 });
      }

      const result = await updateMarketplaceAsset({
        assetId,
        sellerId,
        sellerName,
        title,
        category,
        description,
        location,
        pricePerToken: tokenPriceSats,
        tokenPriceSats,
        totalTokens,
        cycleDurationDays: cycleDurationDays as 30 | 60 | 90,
        estimatedApyBps,
        historicalRoiBps,
        expectedYield,
        proofOfAssetHash: proofOfAssetHash || crypto.randomUUID().replace(/-/g, ""),
        imageUrl,
        imageUrls,
        videoUrl,
        mediaGallery,
      });
      if (!result.ok) {
        return NextResponse.json({ ok: false, message: result.message }, { status: 400 });
      }
      return NextResponse.json({ ok: true, asset: result.asset });
    }

    if (payload.action === "deleteAsset") {
      const authUser = await getAuthUserFromRequest();
      if (!authUser) {
        return NextResponse.json({ ok: false, message: "No autenticado." }, { status: 401 });
      }

      const assetId = payload.assetId?.trim() ?? "";
      const sellerId = authUser.id;
      if (!assetId || !sellerId) {
        return NextResponse.json({ ok: false, message: "Datos invalidos para eliminar activo." }, { status: 400 });
      }
      const result = await deleteMarketplaceAsset({ assetId, sellerId });
      if (!result.ok) {
        return NextResponse.json({ ok: false, message: result.message }, { status: 400 });
      }
      return NextResponse.json({ ok: true });
    }

    if (payload.action === "ensureThread") {
      const authUser = await getAuthUserFromRequest();
      if (!authUser) {
        return NextResponse.json({ ok: false, message: "No autenticado." }, { status: 401 });
      }

      const assetId = payload.assetId?.trim() ?? "";
      const buyerId = authUser.id;
      const buyerName = normalizeSafeText(authUser.fullName ?? "", 120);
      if (!assetId || !buyerId || !buyerName) {
        return NextResponse.json({ ok: false, message: "Datos invalidos para abrir chat." }, { status: 400 });
      }
      const result = await ensureMarketplaceThreadForBuyer({
        assetId,
        buyerId,
        buyerName,
      });
      if (!result.ok) {
        return NextResponse.json({ ok: false, message: result.message }, { status: 400 });
      }
      return NextResponse.json({ ok: true, thread: result.thread });
    }

    if (payload.action === "sendMessage") {
      const authUser = await getAuthUserFromRequest();
      if (!authUser) {
        return NextResponse.json({ ok: false, message: "No autenticado." }, { status: 401 });
      }

      const threadId = payload.threadId?.trim() ?? "";
      const senderId = authUser.id;
      const senderName = normalizeSafeText(authUser.fullName ?? "", 120);
      const kind = payload.kind ?? "text";
      const allowedKinds = new Set(["text", "image", "video", "audio", "document"]);
      const text = normalizeSafeText(payload.text ?? "", 500);
      const attachment = payload.attachment;
      const hasAttachment = Boolean(attachment?.dataUrl);

      if (!threadId || !senderId || !senderName) {
        return NextResponse.json({ ok: false, message: "Datos invalidos para mensaje." }, { status: 400 });
      }
      if (!allowedKinds.has(kind)) {
        return NextResponse.json({ ok: false, message: "Tipo de mensaje invalido." }, { status: 400 });
      }
      if (!text && !hasAttachment) {
        return NextResponse.json({ ok: false, message: "Escribe un mensaje." }, { status: 400 });
      }
      if (hasAttachment) {
        const size = Number(attachment?.size ?? 0);
        if (!Number.isFinite(size) || size <= 0 || size > 25 * 1024 * 1024) {
          return NextResponse.json({ ok: false, message: "El archivo supera el limite de 25 MB." }, { status: 400 });
        }
        if (!attachment?.name || !attachment?.mimeType || !attachment?.dataUrl) {
          return NextResponse.json({ ok: false, message: "Adjunto invalido." }, { status: 400 });
        }
        if (!isSafeMediaDataUrl(attachment.dataUrl)) {
          return NextResponse.json({ ok: false, message: "Formato de adjunto no permitido." }, { status: 400 });
        }
        const decodedSize = getDataUrlByteSize(attachment.dataUrl);
        if (!decodedSize || Math.abs(decodedSize - size) > 2048 || decodedSize > 25 * 1024 * 1024) {
          return NextResponse.json({ ok: false, message: "Tamano de adjunto inconsistente o invalido." }, { status: 400 });
        }
        const mimeType = attachment.mimeType.trim().toLowerCase();
        if (!/^(image|video|audio)\//.test(mimeType) && mimeType !== "application/pdf" && mimeType !== "text/plain") {
          return NextResponse.json({ ok: false, message: "MIME type de adjunto no permitido." }, { status: 400 });
        }
      }

      const result = await sendMarketplaceMessage({
        threadId,
        senderId,
        senderName,
        kind,
        text,
        attachment: hasAttachment
          ? {
            name: attachment!.name!,
            mimeType: attachment!.mimeType!,
            size: Number(attachment!.size),
            dataUrl: attachment!.dataUrl!,
          }
          : undefined,
      });
      if (!result.ok) {
        return NextResponse.json({ ok: false, message: result.message }, { status: 400 });
      }
      return NextResponse.json({ ok: true, message: result.message });
    }

    if (payload.action === "markRead") {
      const authUser = await getAuthUserFromRequest();
      if (!authUser) {
        return NextResponse.json({ ok: false, message: "No autenticado." }, { status: 401 });
      }

      const threadId = payload.threadId?.trim() ?? "";
      if (!threadId) {
        return NextResponse.json({ ok: false, message: "Datos invalidos para marcar lectura." }, { status: 400 });
      }
      const result = await markMarketplaceMessagesRead({ threadId, actorId: authUser.id });
      return NextResponse.json(result);
    }

    if (payload.action === "deleteMessages") {
      const authUser = await getAuthUserFromRequest();
      if (!authUser) {
        return NextResponse.json({ ok: false, message: "No autenticado." }, { status: 401 });
      }

      const threadId = payload.threadId?.trim() ?? "";
      const actorId = authUser.id;
      const mode = payload.mode;
      const messageIds = Array.isArray(payload.messageIds)
        ? payload.messageIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
        : [];
      const normalizedMessageIds = Array.from(new Set(messageIds)).slice(0, MAX_MESSAGE_IDS);
      if (!threadId || !actorId || (mode !== "me" && mode !== "everyone") || normalizedMessageIds.length === 0) {
        return NextResponse.json({ ok: false, message: "Datos invalidos para eliminar mensajes." }, { status: 400 });
      }
      const result = await deleteMarketplaceMessages({ threadId, actorId, messageIds: normalizedMessageIds, mode });
      if (!result.ok) {
        return NextResponse.json({ ok: false, message: result.message }, { status: 400 });
      }
      return NextResponse.json(result);
    }

    return NextResponse.json({ ok: false, message: "Accion no soportada." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Operacion marketplace fallida." },
      { status: 500 },
    );
  }
}
