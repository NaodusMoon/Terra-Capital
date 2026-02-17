import "server-only";
import type { PoolClient } from "pg";
import { getPostgresPool } from "@/lib/server/postgres";
import type { ChatMessage, ChatThread, PurchaseRecord, TokenizedAsset } from "@/types/market";

interface DbAssetRow {
  id: string;
  title: string;
  category: TokenizedAsset["category"];
  description: string;
  location: string;
  price_per_token: string | number;
  total_tokens: number;
  available_tokens: number;
  expected_yield: string;
  seller_id: string;
  seller_name: string;
  image_url: string | null;
  image_urls: unknown;
  video_url: string | null;
  created_at: string;
}

interface DbPurchaseRow {
  id: string;
  asset_id: string;
  buyer_id: string;
  buyer_name: string;
  seller_id: string;
  quantity: number;
  price_per_token: string | number;
  total_paid: string | number;
  purchased_at: string;
}

interface DbThreadRow {
  id: string;
  asset_id: string;
  buyer_id: string;
  buyer_name: string;
  seller_id: string;
  seller_name: string;
  updated_at: string;
}

interface DbMessageRow {
  id: string;
  thread_id: string;
  sender_id: string;
  sender_name: string;
  sender_role: "buyer" | "seller";
  text: string;
  status: "sending" | "sent" | "read" | "failed";
  kind: "text" | "image" | "video" | "audio" | "document";
  attachment: unknown;
  error_message: string | null;
  read_at: string | null;
  created_at: string;
}

function toNumber(value: string | number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseStringArray(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const filtered = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return filtered.length > 0 ? filtered : undefined;
}

function parseAttachment(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const row = value as {
    name?: unknown;
    mimeType?: unknown;
    size?: unknown;
    dataUrl?: unknown;
  };
  if (typeof row.name !== "string" || typeof row.mimeType !== "string" || typeof row.dataUrl !== "string") {
    return undefined;
  }
  const parsedSize = Number(row.size);
  if (!Number.isFinite(parsedSize) || parsedSize < 0) return undefined;
  return {
    name: row.name,
    mimeType: row.mimeType,
    size: parsedSize,
    dataUrl: row.dataUrl,
  };
}

function mapAssetRow(row: DbAssetRow): TokenizedAsset {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    description: row.description,
    location: row.location,
    pricePerToken: toNumber(row.price_per_token),
    totalTokens: row.total_tokens,
    availableTokens: row.available_tokens,
    expectedYield: row.expected_yield,
    sellerId: row.seller_id,
    sellerName: row.seller_name,
    imageUrl: row.image_url ?? undefined,
    imageUrls: parseStringArray(row.image_urls),
    videoUrl: row.video_url ?? undefined,
    createdAt: row.created_at,
  };
}

function mapPurchaseRow(row: DbPurchaseRow): PurchaseRecord {
  return {
    id: row.id,
    assetId: row.asset_id,
    buyerId: row.buyer_id,
    buyerName: row.buyer_name,
    sellerId: row.seller_id,
    quantity: row.quantity,
    pricePerToken: toNumber(row.price_per_token),
    totalPaid: toNumber(row.total_paid),
    purchasedAt: row.purchased_at,
  };
}

function mapThreadRow(row: DbThreadRow): ChatThread {
  return {
    id: row.id,
    assetId: row.asset_id,
    buyerId: row.buyer_id,
    buyerName: row.buyer_name,
    sellerId: row.seller_id,
    sellerName: row.seller_name,
    updatedAt: row.updated_at,
  };
}

function mapMessageRow(row: DbMessageRow): ChatMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    senderId: row.sender_id,
    senderName: row.sender_name,
    senderRole: row.sender_role,
    text: row.text,
    status: row.status,
    kind: row.kind,
    attachment: parseAttachment(row.attachment),
    errorMessage: row.error_message ?? undefined,
    readAt: row.read_at ?? undefined,
    createdAt: row.created_at,
  };
}

export async function getMarketplaceState(userId?: string) {
  const pool = getPostgresPool();
  const assetsResult = await pool.query<DbAssetRow>(
    `SELECT id, title, category, description, location, price_per_token, total_tokens, available_tokens, expected_yield, seller_id, seller_name, image_url, image_urls, video_url, created_at
     FROM marketplace_assets
     ORDER BY created_at DESC`,
  );

  const purchasesResult = userId
    ? await pool.query<DbPurchaseRow>(
      `SELECT id, asset_id, buyer_id, buyer_name, seller_id, quantity, price_per_token, total_paid, purchased_at
       FROM marketplace_purchases
       WHERE buyer_id = $1 OR seller_id = $1
       ORDER BY purchased_at DESC`,
      [userId],
    )
    : { rows: [] as DbPurchaseRow[] };

  const threadsResult = userId
    ? await pool.query<DbThreadRow>(
      `SELECT id, asset_id, buyer_id, buyer_name, seller_id, seller_name, updated_at
       FROM marketplace_threads
       WHERE buyer_id = $1 OR seller_id = $1
       ORDER BY updated_at DESC`,
      [userId],
    )
    : { rows: [] as DbThreadRow[] };

  const threadIds = threadsResult.rows.map((row) => row.id);
  let messagesRows: DbMessageRow[] = [];
  if (threadIds.length > 0) {
    const messagesResult = await pool.query<DbMessageRow>(
      `SELECT id, thread_id, sender_id, sender_name, sender_role, text, status, kind, attachment, error_message, read_at, created_at
       FROM marketplace_messages
       WHERE thread_id = ANY($1::uuid[])
       ORDER BY created_at ASC`,
      [threadIds],
    );
    messagesRows = messagesResult.rows;
  }

  const volumeResult = await pool.query<{ gross_volume: string | number }>(
    `SELECT COALESCE(SUM(total_paid), 0) AS gross_volume
     FROM marketplace_purchases`,
  );
  const grossVolume = toNumber(volumeResult.rows[0]?.gross_volume ?? 0);

  return {
    assets: assetsResult.rows.map(mapAssetRow),
    purchases: purchasesResult.rows.map(mapPurchaseRow),
    threads: threadsResult.rows.map(mapThreadRow),
    messages: messagesRows.map(mapMessageRow),
    blendSnapshot: {
      grossVolume,
      sentToBlend: grossVolume * 0.8,
      reserveForPayouts: grossVolume * 0.2,
      cycle: "mensual o bimestral",
    },
  };
}

export async function createMarketplaceAsset(input: {
  title: string;
  category: TokenizedAsset["category"];
  description: string;
  location: string;
  pricePerToken: number;
  totalTokens: number;
  expectedYield: string;
  sellerId: string;
  sellerName: string;
  imageUrl?: string;
  imageUrls?: string[];
  videoUrl?: string;
}) {
  const pool = getPostgresPool();
  const result = await pool.query<DbAssetRow>(
    `INSERT INTO marketplace_assets (
      id, title, category, description, location, price_per_token, total_tokens, available_tokens, expected_yield,
      seller_id, seller_name, image_url, image_urls, video_url
    )
    VALUES (
      gen_random_uuid(), $1, $2, $3, $4, $5, $6, $6, $7,
      $8, $9, $10, $11::jsonb, $12
    )
    RETURNING id, title, category, description, location, price_per_token, total_tokens, available_tokens, expected_yield, seller_id, seller_name, image_url, image_urls, video_url, created_at`,
    [
      input.title,
      input.category,
      input.description,
      input.location,
      input.pricePerToken,
      input.totalTokens,
      input.expectedYield,
      input.sellerId,
      input.sellerName,
      input.imageUrl ?? null,
      JSON.stringify(input.imageUrls ?? []),
      input.videoUrl ?? null,
    ],
  );
  return mapAssetRow(result.rows[0]);
}

export async function buyMarketplaceAsset(input: {
  assetId: string;
  buyerId: string;
  buyerName: string;
  quantity: number;
}) {
  const pool = getPostgresPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const assetResult = await client.query<DbAssetRow>(
      `SELECT id, title, category, description, location, price_per_token, total_tokens, available_tokens, expected_yield, seller_id, seller_name, image_url, image_urls, video_url, created_at
       FROM marketplace_assets
       WHERE id = $1
       FOR UPDATE`,
      [input.assetId],
    );
    const asset = assetResult.rows[0];
    if (!asset) {
      await client.query("ROLLBACK");
      return { ok: false as const, message: "Activo no encontrado." };
    }
    if (asset.available_tokens < input.quantity) {
      await client.query("ROLLBACK");
      return { ok: false as const, message: "No hay suficientes tokens disponibles." };
    }

    await client.query(
      `UPDATE marketplace_assets
       SET available_tokens = available_tokens - $1, updated_at = timezone('utc', now())
       WHERE id = $2`,
      [input.quantity, input.assetId],
    );

    const purchaseResult = await client.query<DbPurchaseRow>(
      `INSERT INTO marketplace_purchases (
        id, asset_id, buyer_id, buyer_name, seller_id, quantity, price_per_token, total_paid, purchased_at
      )
      VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, timezone('utc', now())
      )
      RETURNING id, asset_id, buyer_id, buyer_name, seller_id, quantity, price_per_token, total_paid, purchased_at`,
      [
        input.assetId,
        input.buyerId,
        input.buyerName,
        asset.seller_id,
        input.quantity,
        asset.price_per_token,
        toNumber(asset.price_per_token) * input.quantity,
      ],
    );

    const threadResult = await client.query<DbThreadRow>(
      `INSERT INTO marketplace_threads (
        id, asset_id, buyer_id, buyer_name, seller_id, seller_name, updated_at
      )
      VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, timezone('utc', now())
      )
      ON CONFLICT (asset_id, buyer_id, seller_id)
      DO UPDATE SET
        buyer_name = EXCLUDED.buyer_name,
        seller_name = EXCLUDED.seller_name,
        updated_at = timezone('utc', now())
      RETURNING id, asset_id, buyer_id, buyer_name, seller_id, seller_name, updated_at`,
      [input.assetId, input.buyerId, input.buyerName, asset.seller_id, asset.seller_name],
    );

    await client.query("COMMIT");
    return {
      ok: true as const,
      purchase: mapPurchaseRow(purchaseResult.rows[0]),
      thread: mapThreadRow(threadResult.rows[0]),
    };
  } catch {
    await client.query("ROLLBACK");
    throw new Error("No se pudo completar la compra.");
  } finally {
    client.release();
  }
}

export async function ensureMarketplaceThreadForBuyer(input: {
  assetId: string;
  buyerId: string;
  buyerName: string;
}) {
  const pool = getPostgresPool();
  const assetResult = await pool.query<DbAssetRow>(
    `SELECT id, title, category, description, location, price_per_token, total_tokens, available_tokens, expected_yield, seller_id, seller_name, image_url, image_urls, video_url, created_at
     FROM marketplace_assets
     WHERE id = $1
     LIMIT 1`,
    [input.assetId],
  );
  const asset = assetResult.rows[0];
  if (!asset) {
    return { ok: false as const, message: "Activo no encontrado." };
  }

  const threadResult = await pool.query<DbThreadRow>(
    `INSERT INTO marketplace_threads (
      id, asset_id, buyer_id, buyer_name, seller_id, seller_name, updated_at
    )
    VALUES (
      gen_random_uuid(), $1, $2, $3, $4, $5, timezone('utc', now())
    )
    ON CONFLICT (asset_id, buyer_id, seller_id)
    DO UPDATE SET
      buyer_name = EXCLUDED.buyer_name,
      seller_name = EXCLUDED.seller_name
    RETURNING id, asset_id, buyer_id, buyer_name, seller_id, seller_name, updated_at`,
    [input.assetId, input.buyerId, input.buyerName, asset.seller_id, asset.seller_name],
  );

  return {
    ok: true as const,
    thread: mapThreadRow(threadResult.rows[0]),
  };
}

export async function sendMarketplaceMessage(input: {
  threadId: string;
  senderId: string;
  senderName: string;
  senderRole: "buyer" | "seller";
  text: string;
  kind: "text" | "image" | "video" | "audio" | "document";
  attachment?: {
    name: string;
    mimeType: string;
    size: number;
    dataUrl: string;
  };
}) {
  const pool = getPostgresPool();
  const client: PoolClient = await pool.connect();
  try {
    await client.query("BEGIN");

    const threadResult = await client.query<DbThreadRow>(
      `SELECT id, asset_id, buyer_id, buyer_name, seller_id, seller_name, updated_at
       FROM marketplace_threads
       WHERE id = $1
       LIMIT 1`,
      [input.threadId],
    );
    if (threadResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return { ok: false as const, message: "Conversacion no encontrada." };
    }

    const messageResult = await client.query<DbMessageRow>(
      `INSERT INTO marketplace_messages (
        id, thread_id, sender_id, sender_name, sender_role, text, status, kind, attachment, error_message, read_at, created_at
      )
      VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, 'sent', $6, $7::jsonb, NULL, NULL, timezone('utc', now())
      )
      RETURNING id, thread_id, sender_id, sender_name, sender_role, text, status, kind, attachment, error_message, read_at, created_at`,
      [
        input.threadId,
        input.senderId,
        input.senderName,
        input.senderRole,
        input.text,
        input.kind,
        input.attachment ? JSON.stringify(input.attachment) : null,
      ],
    );

    await client.query(
      `UPDATE marketplace_threads
       SET updated_at = timezone('utc', now())
       WHERE id = $1`,
      [input.threadId],
    );

    await client.query("COMMIT");
    return {
      ok: true as const,
      message: mapMessageRow(messageResult.rows[0]),
    };
  } catch {
    await client.query("ROLLBACK");
    throw new Error("No se pudo enviar el mensaje.");
  } finally {
    client.release();
  }
}

export async function markMarketplaceMessagesRead(input: {
  threadId: string;
  readerRole: "buyer" | "seller";
}) {
  const pool = getPostgresPool();
  const result = await pool.query<{ id: string }>(
    `UPDATE marketplace_messages
     SET status = 'read', read_at = timezone('utc', now())
     WHERE thread_id = $1
       AND sender_role <> $2
       AND status <> 'read'
       AND status <> 'failed'
     RETURNING id`,
    [input.threadId, input.readerRole],
  );

  const changed = (result.rowCount ?? 0) > 0;
  if (changed) {
    await pool.query(
      `UPDATE marketplace_threads
       SET updated_at = timezone('utc', now())
       WHERE id = $1`,
      [input.threadId],
    );
  }

  return {
    ok: true as const,
    changed,
  };
}
