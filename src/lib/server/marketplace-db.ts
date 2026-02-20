import "server-only";
import type { PoolClient } from "pg";
import { getPostgresPool } from "@/lib/server/postgres";
import type { AssetApiState, ChatMessage, ChatThread, PurchaseRecord, TokenizedAsset } from "@/types/market";

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
  media_gallery: unknown;
  token_price_sats: string | number;
  cycle_duration_days: 30 | 60 | 90;
  lifecycle_status: "FUNDING" | "OPERATING" | "SETTLED";
  cycle_start_at: string | null;
  cycle_end_at: string;
  estimated_apy_bps: number;
  historical_roi_bps: number;
  proof_of_asset_hash: string;
  audit_hash: string | null;
  health_score: "Optimal" | "Warning" | "Critical";
  current_yield_accrued_sats: string | number;
  net_profit_sats: string | number | null;
  final_payout_sats: string | number | null;
  snapshot_locked_at: string | null;
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
  deleted_for_everyone?: boolean;
  deleted_for_everyone_at?: string | null;
  deleted_for_everyone_by?: string | null;
  created_at: string;
}

let cachedSupportsDeleteColumns: boolean | null = null;

async function supportsMessageDeleteColumns() {
  if (cachedSupportsDeleteColumns !== null) return cachedSupportsDeleteColumns;
  const pool = getPostgresPool();
  try {
    const result = await pool.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'marketplace_messages'
         AND column_name = ANY($1::text[])`,
      [[
        "deleted_for_everyone",
        "deleted_for_everyone_at",
        "deleted_for_everyone_by",
        "deleted_for_user_ids",
      ]],
    );
    cachedSupportsDeleteColumns = result.rows.length === 4;
  } catch {
    cachedSupportsDeleteColumns = false;
  }
  return cachedSupportsDeleteColumns;
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

function parseMediaGallery(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const out = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as { id?: unknown; kind?: unknown; url?: unknown };
      if (typeof row.id !== "string" || typeof row.url !== "string") return null;
      if (row.kind !== "image" && row.kind !== "video") return null;
      return { id: row.id, kind: row.kind, url: row.url };
    })
    .filter((item): item is { id: string; kind: "image" | "video"; url: string } => Boolean(item));
  return out.length > 0 ? out : undefined;
}

function toWholeNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toMaybeWholeNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatBpsAsPercent(value: number) {
  return `${(value / 100).toFixed(2)}%`;
}

function calcProgressPct(asset: DbAssetRow) {
  if (asset.lifecycle_status === "SETTLED") return 100;
  if (asset.lifecycle_status === "FUNDING") {
    const sold = asset.total_tokens - asset.available_tokens;
    return clamp(Math.round((sold / Math.max(1, asset.total_tokens)) * 100), 0, 100);
  }
  const endMs = +new Date(asset.cycle_end_at);
  const startMs = +(asset.cycle_start_at ? new Date(asset.cycle_start_at) : new Date(asset.created_at));
  const nowMs = Date.now();
  const duration = Math.max(1, endMs - startMs);
  const elapsed = clamp(nowMs - startMs, 0, duration);
  return clamp(Math.round((elapsed / duration) * 100), 0, 100);
}

function estimateNetProfitSats(asset: DbAssetRow) {
  const soldTokens = Math.max(0, asset.total_tokens - asset.available_tokens);
  const principal = soldTokens * toWholeNumber(asset.token_price_sats);
  return Math.max(0, Math.floor((principal * asset.estimated_apy_bps * asset.cycle_duration_days) / (10000 * 365)));
}

function estimateCurrentYieldSats(asset: DbAssetRow) {
  const persisted = toWholeNumber(asset.current_yield_accrued_sats);
  if (persisted > 0) return persisted;
  const progress = calcProgressPct(asset);
  const netProfit = toMaybeWholeNumber(asset.net_profit_sats) ?? estimateNetProfitSats(asset);
  return Math.floor((Math.max(0, netProfit) * progress) / 100);
}

function buildApiState(row: DbAssetRow): AssetApiState {
  if (row.lifecycle_status === "FUNDING") {
    return {
      status: "FUNDING",
      funding_progress: calcProgressPct(row),
      tokens_available: row.available_tokens,
      total_supply: row.total_tokens,
      estimated_apy: formatBpsAsPercent(row.estimated_apy_bps),
    };
  }
  if (row.lifecycle_status === "OPERATING") {
    const daysRemaining = Math.max(
      0,
      Math.ceil((+new Date(row.cycle_end_at) - Date.now()) / (1000 * 60 * 60 * 24)),
    );
    return {
      status: "OPERATING",
      days_remaining: daysRemaining,
      current_yield_accrued: estimateCurrentYieldSats(row),
      health_score: row.health_score,
    };
  }
  return {
    status: "SETTLED",
    final_payout_sats:
      toMaybeWholeNumber(row.final_payout_sats) ??
      (Math.max(0, row.total_tokens - row.available_tokens) * toWholeNumber(row.token_price_sats)) +
        (toMaybeWholeNumber(row.net_profit_sats) ?? estimateNetProfitSats(row)),
    cycle_performance: `+${formatBpsAsPercent(row.historical_roi_bps)}`,
    audit_hash: row.audit_hash ?? "tx_pending...hash",
  };
}

function mapAssetRow(
  row: DbAssetRow,
  metrics?: {
    participationPct?: number;
    sellerRetentionPct?: number;
    recurringInvestors?: number;
  },
): TokenizedAsset {
  const soldTokens = row.total_tokens - row.available_tokens;
  const capitalizationCurrent = soldTokens * toWholeNumber(row.token_price_sats);
  const capitalizationGoal = row.total_tokens * toWholeNumber(row.token_price_sats);
  const lifecycleProgress = calcProgressPct(row);

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
    mediaGallery: parseMediaGallery(row.media_gallery),
    tokenPriceSats: toWholeNumber(row.token_price_sats),
    cycleDurationDays: row.cycle_duration_days,
    lifecycleStatus: row.lifecycle_status,
    cycleStartAt: row.cycle_start_at ?? undefined,
    cycleEndAt: row.cycle_end_at,
    estimatedApyBps: row.estimated_apy_bps,
    historicalRoiBps: row.historical_roi_bps,
    proofOfAssetHash: row.proof_of_asset_hash,
    auditHash: row.audit_hash ?? undefined,
    healthScore: row.health_score,
    currentYieldAccruedSats: estimateCurrentYieldSats(row),
    netProfitSats: toMaybeWholeNumber(row.net_profit_sats),
    finalPayoutSats: toMaybeWholeNumber(row.final_payout_sats),
    snapshotLockedAt: row.snapshot_locked_at ?? undefined,
    apiState: buildApiState(row),
    investorMetrics: {
      projectedRoi: formatBpsAsPercent(row.historical_roi_bps),
      cycleProgressPct: lifecycleProgress,
      participationPct: metrics?.participationPct ?? 0,
      verificationHash: row.proof_of_asset_hash,
    },
    sellerMetrics: {
      absorptionRatePct: clamp((soldTokens / Math.max(1, row.total_tokens)) * 100, 0, 100),
      capitalizationCurrentSats: capitalizationCurrent,
      capitalizationGoalSats: capitalizationGoal,
      retentionPct: metrics?.sellerRetentionPct ?? 0,
      recurringInvestors: metrics?.recurringInvestors ?? 0,
    },
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
    deletedForEveryone: Boolean(row.deleted_for_everyone),
    deletedForEveryoneAt: row.deleted_for_everyone_at ?? undefined,
    deletedForEveryoneBy: row.deleted_for_everyone_by ?? undefined,
    createdAt: row.created_at,
  };
}

export async function getMarketplaceState(userId?: string, options?: { includeChat?: boolean }) {
  const pool = getPostgresPool();
  await pool.query(
    `UPDATE marketplace_assets
     SET
       lifecycle_status = CASE
         WHEN cycle_end_at <= timezone('utc', now()) THEN 'SETTLED'
         WHEN cycle_start_at IS NOT NULL THEN 'OPERATING'
         ELSE 'FUNDING'
       END,
       snapshot_locked_at = CASE
         WHEN cycle_end_at <= timezone('utc', now()) THEN COALESCE(snapshot_locked_at, timezone('utc', now()))
         ELSE snapshot_locked_at
       END,
       audit_hash = CASE
         WHEN cycle_end_at <= timezone('utc', now()) THEN COALESCE(audit_hash, concat('tx_', substring(md5(id::text || timezone('utc', now())::text) from 1 for 10), '...abc'))
         ELSE audit_hash
       END
     WHERE lifecycle_status <> CASE
       WHEN cycle_end_at <= timezone('utc', now()) THEN 'SETTLED'
       WHEN cycle_start_at IS NOT NULL THEN 'OPERATING'
       ELSE 'FUNDING'
     END
     OR (cycle_end_at <= timezone('utc', now()) AND snapshot_locked_at IS NULL)`,
  );
  const withDeleteColumns = await supportsMessageDeleteColumns();
  const includeChat = options?.includeChat ?? false;
  const assetsResult = await pool.query<DbAssetRow>(
    `SELECT id, title, category, description, location, price_per_token, total_tokens, available_tokens, expected_yield, seller_id, seller_name, image_url, image_urls, video_url, media_gallery,
            token_price_sats, cycle_duration_days, lifecycle_status, cycle_start_at, cycle_end_at, estimated_apy_bps, historical_roi_bps, proof_of_asset_hash,
            audit_hash, health_score, current_yield_accrued_sats, net_profit_sats, final_payout_sats, snapshot_locked_at, created_at
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

  const threadsResult = userId && includeChat
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
    const messagesResult = withDeleteColumns
      ? await pool.query<DbMessageRow>(
        `SELECT id, thread_id, sender_id, sender_name, sender_role, text, status, kind, attachment, error_message, read_at,
                deleted_for_everyone, deleted_for_everyone_at, deleted_for_everyone_by, created_at
         FROM marketplace_messages
         WHERE thread_id = ANY($1::uuid[])
           AND ($2::uuid IS NULL OR NOT ($2::uuid = ANY(deleted_for_user_ids)))
         ORDER BY created_at ASC`,
        [threadIds, userId ?? null],
      )
      : await pool.query<DbMessageRow>(
        `SELECT id, thread_id, sender_id, sender_name, sender_role, text, status, kind, attachment, error_message, read_at,
                created_at
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
  const buyerParticipationByAsset = new Map<string, number>();
  const sellerRetentionBySeller = new Map<string, { retentionPct: number; recurringInvestors: number }>();

  if (userId) {
    const buyerParticipationResult = await pool.query<{ asset_id: string; tokens: string | number }>(
      `SELECT asset_id, COALESCE(SUM(quantity), 0) AS tokens
       FROM marketplace_purchases
       WHERE buyer_id = $1
       GROUP BY asset_id`,
      [userId],
    );
    for (const row of buyerParticipationResult.rows) {
      buyerParticipationByAsset.set(row.asset_id, toNumber(row.tokens));
    }

    const sellerRetentionResult = await pool.query<{ seller_id: string; recurring: string | number; total_buyers: string | number }>(
      `SELECT seller_id,
              COALESCE(SUM(CASE WHEN purchase_count > 1 THEN 1 ELSE 0 END), 0) AS recurring,
              COUNT(*) AS total_buyers
       FROM (
         SELECT seller_id, buyer_id, COUNT(*) AS purchase_count
         FROM marketplace_purchases
         GROUP BY seller_id, buyer_id
       ) grouped
       GROUP BY seller_id`,
    );
    for (const row of sellerRetentionResult.rows) {
      const recurring = toNumber(row.recurring);
      const totalBuyers = toNumber(row.total_buyers);
      sellerRetentionBySeller.set(row.seller_id, {
        recurringInvestors: recurring,
        retentionPct: totalBuyers > 0 ? (recurring / totalBuyers) * 100 : 0,
      });
    }
  }

  return {
    assets: assetsResult.rows.map((assetRow) => {
      const buyerTokens = buyerParticipationByAsset.get(assetRow.id) ?? 0;
      const participationPct = (buyerTokens / Math.max(1, assetRow.total_tokens)) * 100;
      const retention = sellerRetentionBySeller.get(assetRow.seller_id);
      return mapAssetRow(assetRow, {
        participationPct,
        sellerRetentionPct: retention?.retentionPct ?? 0,
        recurringInvestors: retention?.recurringInvestors ?? 0,
      });
    }),
    purchases: purchasesResult.rows.map(mapPurchaseRow),
    threads: threadsResult.rows.map(mapThreadRow),
    messages: messagesRows.map(mapMessageRow),
    blendSnapshot: {
      grossVolume,
      sentToBlend: Math.floor(grossVolume * 0.8),
      reserveForPayouts: Math.ceil(grossVolume * 0.2),
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
  tokenPriceSats: number;
  totalTokens: number;
  cycleDurationDays: 30 | 60 | 90;
  estimatedApyBps: number;
  historicalRoiBps: number;
  expectedYield: string;
  proofOfAssetHash: string;
  sellerId: string;
  sellerName: string;
  imageUrl?: string;
  imageUrls?: string[];
  videoUrl?: string;
  mediaGallery?: Array<{ id: string; kind: "image" | "video"; url: string }>;
}) {
  const pool = getPostgresPool();
  const result = await pool.query<DbAssetRow>(
    `INSERT INTO marketplace_assets (
      id, title, category, description, location, price_per_token, total_tokens, available_tokens, expected_yield,
      seller_id, seller_name, image_url, image_urls, video_url, media_gallery, token_price_sats, cycle_duration_days, lifecycle_status, cycle_end_at,
      estimated_apy_bps, historical_roi_bps, proof_of_asset_hash, health_score, current_yield_accrued_sats
    )
    VALUES (
      gen_random_uuid(), $1, $2, $3, $4, $5, $6, $6, $7,
      $8, $9, $10, $11::jsonb, $12, $13::jsonb, $14, $15, 'FUNDING',
      timezone('utc', now()) + make_interval(days => $15), $16, $17, $18, 'Optimal', 0
    )
    RETURNING id, title, category, description, location, price_per_token, total_tokens, available_tokens, expected_yield, seller_id, seller_name, image_url, image_urls, video_url, media_gallery,
              token_price_sats, cycle_duration_days, lifecycle_status, cycle_start_at, cycle_end_at, estimated_apy_bps, historical_roi_bps, proof_of_asset_hash,
              audit_hash, health_score, current_yield_accrued_sats, net_profit_sats, final_payout_sats, snapshot_locked_at, created_at`,
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
      JSON.stringify(input.mediaGallery ?? []),
      input.tokenPriceSats,
      input.cycleDurationDays,
      input.estimatedApyBps,
      input.historicalRoiBps,
      input.proofOfAssetHash,
    ],
  );
  return mapAssetRow(result.rows[0]);
}

export async function updateMarketplaceAsset(input: {
  assetId: string;
  sellerId: string;
  sellerName: string;
  title: string;
  category: TokenizedAsset["category"];
  description: string;
  location: string;
  pricePerToken: number;
  tokenPriceSats: number;
  totalTokens: number;
  cycleDurationDays: 30 | 60 | 90;
  estimatedApyBps: number;
  historicalRoiBps: number;
  expectedYield: string;
  proofOfAssetHash: string;
  imageUrl?: string;
  imageUrls?: string[];
  videoUrl?: string;
  mediaGallery?: Array<{ id: string; kind: "image" | "video"; url: string }>;
}) {
  const pool = getPostgresPool();
  const result = await pool.query<DbAssetRow>(
    `UPDATE marketplace_assets
     SET
       title = $1,
       category = $2,
       description = $3,
       location = $4,
       price_per_token = $5,
       total_tokens = $6,
       available_tokens = GREATEST(0, LEAST($6, available_tokens + ($6 - total_tokens))),
       expected_yield = $7,
       seller_name = $8,
       image_url = $9,
       image_urls = $10::jsonb,
       video_url = $11,
       media_gallery = $12::jsonb,
       token_price_sats = $13,
       cycle_duration_days = $14,
       estimated_apy_bps = $15,
       historical_roi_bps = $16,
       proof_of_asset_hash = $17,
       cycle_end_at = CASE
         WHEN cycle_start_at IS NULL THEN timezone('utc', now()) + make_interval(days => $14)
         ELSE cycle_start_at + make_interval(days => $14)
       END,
       updated_at = timezone('utc', now())
     WHERE id = $18 AND seller_id = $19
     RETURNING id, title, category, description, location, price_per_token, total_tokens, available_tokens, expected_yield, seller_id, seller_name, image_url, image_urls, video_url, media_gallery,
               token_price_sats, cycle_duration_days, lifecycle_status, cycle_start_at, cycle_end_at, estimated_apy_bps, historical_roi_bps, proof_of_asset_hash,
               audit_hash, health_score, current_yield_accrued_sats, net_profit_sats, final_payout_sats, snapshot_locked_at, created_at`,
    [
      input.title,
      input.category,
      input.description,
      input.location,
      input.pricePerToken,
      input.totalTokens,
      input.expectedYield,
      input.sellerName,
      input.imageUrl ?? null,
      JSON.stringify(input.imageUrls ?? []),
      input.videoUrl ?? null,
      JSON.stringify(input.mediaGallery ?? []),
      input.tokenPriceSats,
      input.cycleDurationDays,
      input.estimatedApyBps,
      input.historicalRoiBps,
      input.proofOfAssetHash,
      input.assetId,
      input.sellerId,
    ],
  );

  if (!result.rows[0]) {
    return { ok: false as const, message: "Activo no encontrado o no autorizado." };
  }

  return { ok: true as const, asset: mapAssetRow(result.rows[0]) };
}

export async function deleteMarketplaceAsset(input: {
  assetId: string;
  sellerId: string;
}) {
  const pool = getPostgresPool();
  const purchasesResult = await pool.query<{ total: string | number }>(
    `SELECT COUNT(*) AS total
     FROM marketplace_purchases
     WHERE asset_id = $1`,
    [input.assetId],
  );
  const purchasesCount = toNumber(purchasesResult.rows[0]?.total ?? 0);
  if (purchasesCount > 0) {
    return { ok: false as const, message: "No puedes eliminar un activo con compras registradas." };
  }

  const deleted = await pool.query<{ id: string }>(
    `DELETE FROM marketplace_assets
     WHERE id = $1 AND seller_id = $2
     RETURNING id`,
    [input.assetId, input.sellerId],
  );
  if (!deleted.rows[0]) {
    return { ok: false as const, message: "Activo no encontrado o no autorizado." };
  }
  return { ok: true as const };
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
      `SELECT id, title, category, description, location, price_per_token, total_tokens, available_tokens, expected_yield, seller_id, seller_name, image_url, image_urls, video_url, media_gallery,
              token_price_sats, cycle_duration_days, lifecycle_status, cycle_start_at, cycle_end_at, estimated_apy_bps, historical_roi_bps, proof_of_asset_hash,
              audit_hash, health_score, current_yield_accrued_sats, net_profit_sats, final_payout_sats, snapshot_locked_at, created_at
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
    if (asset.seller_id === input.buyerId) {
      await client.query("ROLLBACK");
      return { ok: false as const, message: "No puedes comprar tus propios activos." };
    }
    if (asset.available_tokens < input.quantity) {
      await client.query("ROLLBACK");
      return { ok: false as const, message: "No hay suficientes tokens disponibles." };
    }
    if (asset.lifecycle_status !== "FUNDING") {
      await client.query("ROLLBACK");
      return { ok: false as const, message: "Este activo ya no esta en etapa de recaudacion." };
    }

    await client.query(
      `UPDATE marketplace_assets
       SET
         available_tokens = available_tokens - $1,
         cycle_start_at = CASE
           WHEN available_tokens - $1 = 0 AND cycle_start_at IS NULL THEN timezone('utc', now())
           ELSE cycle_start_at
         END,
         cycle_end_at = CASE
           WHEN available_tokens - $1 = 0 AND cycle_start_at IS NULL THEN timezone('utc', now()) + make_interval(days => cycle_duration_days)
           ELSE cycle_end_at
         END,
         lifecycle_status = CASE
           WHEN available_tokens - $1 = 0 THEN 'OPERATING'
           ELSE lifecycle_status
         END,
         updated_at = timezone('utc', now())
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
        asset.token_price_sats,
        toWholeNumber(asset.token_price_sats) * input.quantity,
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
    `SELECT id, title, category, description, location, price_per_token, total_tokens, available_tokens, expected_yield, seller_id, seller_name, image_url, image_urls, video_url, media_gallery,
            token_price_sats, cycle_duration_days, lifecycle_status, cycle_start_at, cycle_end_at, estimated_apy_bps, historical_roi_bps, proof_of_asset_hash,
            audit_hash, health_score, current_yield_accrued_sats, net_profit_sats, final_payout_sats, snapshot_locked_at, created_at
     FROM marketplace_assets
     WHERE id = $1
     LIMIT 1`,
    [input.assetId],
  );
  const asset = assetResult.rows[0];
  if (!asset) {
    return { ok: false as const, message: "Activo no encontrado." };
  }
  if (asset.seller_id === input.buyerId) {
    return { ok: false as const, message: "No puedes abrir un chat contigo mismo." };
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
  const withDeleteColumns = await supportsMessageDeleteColumns();
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
      RETURNING id, thread_id, sender_id, sender_name, sender_role, text, status, kind, attachment, error_message, read_at,
                ${withDeleteColumns
          ? "deleted_for_everyone, deleted_for_everyone_at, deleted_for_everyone_by,"
          : ""}
                created_at`,
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

export async function deleteMarketplaceMessages(input: {
  threadId: string;
  actorId: string;
  messageIds: string[];
  mode: "me" | "everyone";
}) {
  const withDeleteColumns = await supportsMessageDeleteColumns();
  if (!withDeleteColumns) {
    return {
      ok: false as const,
      message: "Falta migracion de chat para eliminar mensajes. Ejecuta las migraciones y vuelve a intentar.",
    };
  }

  const uniqueIds = Array.from(new Set(input.messageIds.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return { ok: false as const, message: "No hay mensajes para eliminar." };
  }

  const pool = getPostgresPool();
  if (input.mode === "me") {
    const result = await pool.query<{ id: string }>(
      `UPDATE marketplace_messages
       SET deleted_for_user_ids = CASE
         WHEN $3::uuid = ANY(deleted_for_user_ids) THEN deleted_for_user_ids
         ELSE array_append(deleted_for_user_ids, $3::uuid)
       END
       WHERE thread_id = $1
         AND id = ANY($2::uuid[])
       RETURNING id`,
      [input.threadId, uniqueIds, input.actorId],
    );
    return {
      ok: true as const,
      deletedIds: result.rows.map((row) => row.id),
      notAllowedIds: uniqueIds.filter((id) => !result.rows.some((row) => row.id === id)),
    };
  }

  const result = await pool.query<{ id: string }>(
    `UPDATE marketplace_messages
     SET deleted_for_everyone = true,
         deleted_for_everyone_at = timezone('utc', now()),
         deleted_for_everyone_by = $3::uuid,
         text = '',
         attachment = NULL,
         kind = 'text'
     WHERE thread_id = $1
       AND id = ANY($2::uuid[])
       AND sender_id = $3
       AND deleted_for_everyone = false
       AND read_at IS NULL
       AND status <> 'read'
     RETURNING id`,
    [input.threadId, uniqueIds, input.actorId],
  );

  return {
    ok: true as const,
    deletedIds: result.rows.map((row) => row.id),
    notAllowedIds: uniqueIds.filter((id) => !result.rows.some((row) => row.id === id)),
  };
}
