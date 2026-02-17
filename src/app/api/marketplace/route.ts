import { NextResponse } from "next/server";
import { normalizeSafeText, toSafeHttpUrlOrUndefined } from "@/lib/security";
import {
  buyMarketplaceAsset,
  createMarketplaceAsset,
  ensureMarketplaceThreadForBuyer,
  getMarketplaceState,
  markMarketplaceMessagesRead,
  sendMarketplaceMessage,
} from "@/lib/server/marketplace-db";
import type { TokenizedAsset } from "@/types/market";

export const runtime = "nodejs";

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
  return raw.filter((value): value is string => typeof value === "string");
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId")?.trim() || undefined;

  try {
    const state = await getMarketplaceState(userId);
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
    sellerId?: string;
    sellerName?: string;
    title?: string;
    category?: unknown;
    description?: string;
    location?: string;
    pricePerToken?: unknown;
    totalTokens?: unknown;
    expectedYield?: string;
    imageUrl?: string;
    imageUrls?: unknown;
    videoUrl?: string;
  }
  | {
    action: "buyAsset";
    assetId?: string;
    buyerId?: string;
    buyerName?: string;
    quantity?: unknown;
  }
  | {
    action: "ensureThread";
    assetId?: string;
    buyerId?: string;
    buyerName?: string;
  }
  | {
    action: "sendMessage";
    threadId?: string;
    senderId?: string;
    senderName?: string;
    senderRole?: "buyer" | "seller";
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
    readerRole?: "buyer" | "seller";
  };

export async function POST(request: Request) {
  let payload: CommandPayload;
  try {
    payload = (await request.json()) as CommandPayload;
  } catch {
    return NextResponse.json({ ok: false, message: "Payload invalido." }, { status: 400 });
  }

  try {
    if (payload.action === "createAsset") {
      const title = normalizeSafeText(payload.title ?? "", 120);
      const category = payload.category;
      const description = normalizeSafeText(payload.description ?? "", 500);
      const location = normalizeSafeText(payload.location ?? "", 80);
      const expectedYield = normalizeSafeText(payload.expectedYield ?? "", 80);
      const sellerId = payload.sellerId?.trim() ?? "";
      const sellerName = normalizeSafeText(payload.sellerName ?? "", 120);
      const pricePerToken = parsePrice(payload.pricePerToken);
      const totalTokens = parseQuantity(payload.totalTokens);
      const imageUrl = toSafeHttpUrlOrUndefined(payload.imageUrl);
      const videoUrl = toSafeHttpUrlOrUndefined(payload.videoUrl);
      const imageUrls = parseStringArray(payload.imageUrls).map((url) => toSafeHttpUrlOrUndefined(url)).filter(Boolean) as string[];

      if (!title || !description || !location || !expectedYield || !sellerId || !sellerName || !isAssetCategory(category)) {
        return NextResponse.json({ ok: false, message: "Campos invalidos para crear activo." }, { status: 400 });
      }
      if (!Number.isFinite(pricePerToken) || !Number.isFinite(totalTokens) || pricePerToken <= 0 || totalTokens <= 0) {
        return NextResponse.json({ ok: false, message: "Precio y tokens deben ser numericos y mayores a 0." }, { status: 400 });
      }

      const asset = await createMarketplaceAsset({
        sellerId,
        sellerName,
        title,
        category,
        description,
        location,
        pricePerToken,
        totalTokens,
        expectedYield,
        imageUrl,
        imageUrls,
        videoUrl,
      });
      return NextResponse.json({ ok: true, asset });
    }

    if (payload.action === "buyAsset") {
      const assetId = payload.assetId?.trim() ?? "";
      const buyerId = payload.buyerId?.trim() ?? "";
      const buyerName = normalizeSafeText(payload.buyerName ?? "", 120);
      const quantity = parseQuantity(payload.quantity);
      if (!assetId || !buyerId || !buyerName || !Number.isFinite(quantity) || quantity <= 0) {
        return NextResponse.json({ ok: false, message: "Datos invalidos para compra." }, { status: 400 });
      }

      const result = await buyMarketplaceAsset({
        assetId,
        buyerId,
        buyerName,
        quantity,
      });
      if (!result.ok) {
        return NextResponse.json({ ok: false, message: result.message }, { status: 400 });
      }

      return NextResponse.json({ ok: true, purchase: result.purchase, thread: result.thread });
    }

    if (payload.action === "ensureThread") {
      const assetId = payload.assetId?.trim() ?? "";
      const buyerId = payload.buyerId?.trim() ?? "";
      const buyerName = normalizeSafeText(payload.buyerName ?? "", 120);
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
      const threadId = payload.threadId?.trim() ?? "";
      const senderId = payload.senderId?.trim() ?? "";
      const senderName = normalizeSafeText(payload.senderName ?? "", 120);
      const senderRole = payload.senderRole;
      const kind = payload.kind ?? "text";
      const text = normalizeSafeText(payload.text ?? "", 500);
      const attachment = payload.attachment;
      const hasAttachment = Boolean(attachment?.dataUrl);

      if (!threadId || !senderId || !senderName || (senderRole !== "buyer" && senderRole !== "seller")) {
        return NextResponse.json({ ok: false, message: "Datos invalidos para mensaje." }, { status: 400 });
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
      }

      const result = await sendMarketplaceMessage({
        threadId,
        senderId,
        senderName,
        senderRole,
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
      const threadId = payload.threadId?.trim() ?? "";
      const readerRole = payload.readerRole;
      if (!threadId || (readerRole !== "buyer" && readerRole !== "seller")) {
        return NextResponse.json({ ok: false, message: "Datos invalidos para marcar lectura." }, { status: 400 });
      }
      const result = await markMarketplaceMessagesRead({ threadId, readerRole });
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
