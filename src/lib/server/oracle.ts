import "server-only";
import { createHash, createHmac } from "node:crypto";
import {
  BASE_FEE,
  Horizon,
  Keypair,
  Memo,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import type { AssetCategory } from "@/types/market";
import { verifyLandRegistry, type LandRegistryCheckResult } from "@/lib/server/land-registry";

type OracleFeedId =
  | "xlm_usd"
  | "usdt_usd"
  | "wheat_futures"
  | "corn_futures"
  | "soybean_futures"
  | "live_cattle_futures"
  | "vnq_reit";

type OracleSource = "coingecko" | "stooq" | "fallback";

export interface OracleFeed {
  id: OracleFeedId;
  label: string;
  symbol: string;
  value: number;
  unit: string;
  updatedAt: string;
  source: OracleSource;
}

export interface OracleSnapshot {
  generatedAt: string;
  suggestedTokenPriceUsdt: number;
  category: AssetCategory;
  categoryLabel: string;
  basePriceUsdt: number;
  marketIndex: number;
  locationFactor: number;
  feeds: OracleFeed[];
  stale: boolean;
  notes: string[];
  attestation: OracleAttestation;
}

export interface OracleAttestation {
  digest: string;
  algorithm: "sha256";
  signer: string;
  signature: string | null;
  anchored: {
    network: "testnet" | "public";
    txHash: string | null;
    anchoredAt: string | null;
    method: "manage_data+memo_hash" | "none";
  };
}

export interface AssetVerificationInput {
  title: string;
  category: AssetCategory;
  location: string;
  description: string;
  mediaUrls: string[];
  declaredProofHash?: string;
  externalRefs?: string[];
}

export interface AssetVerificationReport {
  generatedAt: string;
  evidenceHash: string;
  declaredProofHash: string;
  declaredHashMatchesEvidence: boolean;
  integrityScore: number;
  dataQualityScore: number;
  verdict: "verified_evidence" | "partial_evidence" | "insufficient_evidence";
  checks: Array<{ id: string; ok: boolean; message: string }>;
  landRegistry: LandRegistryCheckResult;
  attestation: OracleAttestation;
}

const CACHE_TTL_MS = Math.max(15_000, Number(process.env.ORACLE_CACHE_TTL_MS ?? 45_000) || 45_000);
const REQUEST_TIMEOUT_MS = 7_000;
const ORACLE_ATTESTATION_SECRET = process.env.ORACLE_ATTESTATION_SECRET?.trim() ?? "";
const ORACLE_ANCHOR_SECRET = process.env.ORACLE_ANCHOR_SECRET?.trim() ?? "";
const ORACLE_ANCHOR_NETWORK = process.env.ORACLE_ANCHOR_NETWORK?.trim().toLowerCase() === "public" ? "public" : "testnet";
const ORACLE_ANCHOR_NAME = (process.env.ORACLE_ANCHOR_DATA_NAME?.trim() || "tc_oracle").slice(0, 64);
const ORACLE_ATTESTATION_SIGNER = process.env.ORACLE_ATTESTATION_SIGNER?.trim() || "terra-capital-oracle-v1";

const categoryBasePrice: Record<AssetCategory, number> = {
  cultivo: Number(process.env.ORACLE_BASE_PRICE_CULTIVO ?? 12),
  tierra: Number(process.env.ORACLE_BASE_PRICE_TIERRA ?? 25),
  ganaderia: Number(process.env.ORACLE_BASE_PRICE_GANADERIA ?? 15),
};

const categoryLabelMap: Record<AssetCategory, string> = {
  cultivo: "Cultivo",
  tierra: "Tierra",
  ganaderia: "Ganaderia",
};

const locationFactorDefaults: Record<string, number> = {
  AR: Number(process.env.ORACLE_LOCATION_FACTOR_AR ?? 1.04),
  CO: Number(process.env.ORACLE_LOCATION_FACTOR_CO ?? 1.02),
  VE: Number(process.env.ORACLE_LOCATION_FACTOR_VE ?? 0.90),
  BO: Number(process.env.ORACLE_LOCATION_FACTOR_BO ?? 0.94),
};

const feedMeta: Record<OracleFeedId, { label: string; symbol: string; unit: string }> = {
  xlm_usd: { label: "Stellar", symbol: "XLM/USD", unit: "USD" },
  usdt_usd: { label: "Tether", symbol: "USDT/USD", unit: "USD" },
  wheat_futures: { label: "Wheat Futures", symbol: "ZW.F", unit: "US cents/bushel" },
  corn_futures: { label: "Corn Futures", symbol: "ZC.F", unit: "US cents/bushel" },
  soybean_futures: { label: "Soybean Futures", symbol: "ZS.F", unit: "US cents/bushel" },
  live_cattle_futures: { label: "Live Cattle", symbol: "LE.F", unit: "US cents/lb" },
  vnq_reit: { label: "US Real Estate ETF", symbol: "VNQ.US", unit: "USD/share" },
};

const baselineIndexValues = {
  wheat_futures: 580,
  corn_futures: 450,
  soybean_futures: 1200,
  live_cattle_futures: 180,
  vnq_reit: 90,
};

let oracleCache: { expiresAt: number; byKey: Record<string, OracleSnapshot> } | null = null;
const anchorByDigest = new Map<string, { txHash: string; anchoredAt: string }>();

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function toRounded(value: number) {
  return Number(value.toFixed(2));
}

function inferCountryCodeFromLocation(location: string) {
  const text = location.trim().toLowerCase();
  if (!text) return "GLOBAL";
  if (text.includes("argentina") || text.includes("buenos aires") || text.includes("santa fe")) return "AR";
  if (text.includes("colombia") || text.includes("bogota") || text.includes("medellin")) return "CO";
  if (text.includes("venezuela") || text.includes("caracas") || text.includes("maracaibo")) return "VE";
  if (text.includes("bolivia") || text.includes("la paz") || text.includes("santa cruz")) return "BO";
  return "GLOBAL";
}

function getLocationFactor(location?: string) {
  const code = inferCountryCodeFromLocation(location ?? "");
  const factor = locationFactorDefaults[code] ?? Number(process.env.ORACLE_LOCATION_FACTOR_GLOBAL ?? 1);
  return {
    code,
    factor: clamp(Number.isFinite(factor) ? factor : 1, 0.7, 1.35),
  };
}

function hashSha256Hex(raw: string) {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

function signDigest(digest: string) {
  if (!ORACLE_ATTESTATION_SECRET) return null;
  return createHmac("sha256", ORACLE_ATTESTATION_SECRET).update(digest, "utf8").digest("hex");
}

function getHorizonUrl(network: "testnet" | "public") {
  return network === "public" ? "https://horizon.stellar.org" : "https://horizon-testnet.stellar.org";
}

function getNetworkPassphrase(network: "testnet" | "public") {
  return network === "public" ? Networks.PUBLIC : Networks.TESTNET;
}

async function anchorDigestOnStellar(digestHex: string): Promise<{ txHash: string; anchoredAt: string } | null> {
  if (!ORACLE_ANCHOR_SECRET) return null;
  const memoBytes = Buffer.from(digestHex, "hex");
  if (memoBytes.length !== 32) return null;
  const cached = anchorByDigest.get(digestHex);
  if (cached) return cached;

  try {
    const sourceKeypair = Keypair.fromSecret(ORACLE_ANCHOR_SECRET);
    const server = new Horizon.Server(getHorizonUrl(ORACLE_ANCHOR_NETWORK));
    const sourceAccount = await server.loadAccount(sourceKeypair.publicKey());
    const tx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: getNetworkPassphrase(ORACLE_ANCHOR_NETWORK),
    })
      .addOperation(Operation.manageData({
        name: ORACLE_ANCHOR_NAME,
        value: memoBytes,
      }))
      .addMemo(Memo.hash(memoBytes))
      .setTimeout(60)
      .build();
    tx.sign(sourceKeypair);
    const result = await server.submitTransaction(tx);
    const out = {
      txHash: result.hash,
      anchoredAt: new Date().toISOString(),
    };
    anchorByDigest.set(digestHex, out);
    return out;
  } catch {
    return null;
  }
}

async function buildAttestation(payload: Record<string, unknown>): Promise<OracleAttestation> {
  const canonical = JSON.stringify(payload);
  const digest = hashSha256Hex(canonical);
  const signature = signDigest(digest);
  const anchored = await anchorDigestOnStellar(digest);
  return {
    digest,
    algorithm: "sha256",
    signer: ORACLE_ATTESTATION_SIGNER,
    signature,
    anchored: {
      network: ORACLE_ANCHOR_NETWORK,
      txHash: anchored?.txHash ?? null,
      anchoredAt: anchored?.anchoredAt ?? null,
      method: anchored ? "manage_data+memo_hash" : "none",
    },
  };
}

function parseStooqCsvLine(csv: string) {
  const rows = csv.trim().split(/\r?\n/g);
  if (rows.length < 2) return null;
  const cols = rows[1].split(",");
  if (cols.length < 7) return null;
  const date = cols[1]?.trim() || "";
  const time = cols[2]?.trim() || "";
  const closeRaw = cols[6]?.trim() || "";
  if (!closeRaw || closeRaw === "N/D") return null;
  const value = Number(closeRaw);
  if (!Number.isFinite(value)) return null;
  const timestamp = date && time && date !== "N/D" && time !== "N/D"
    ? new Date(`${date}T${time}Z`).toISOString()
    : new Date().toISOString();
  return { value, timestamp };
}

async function fetchWithTimeout(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json,text/csv,*/*" },
    });
    if (!response.ok) throw new Error(`Oracle fetch failed: ${response.status}`);
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchStooqFeed(symbol: string): Promise<{ value: number; updatedAt: string }> {
  const response = await fetchWithTimeout(`https://stooq.com/q/l/?s=${encodeURIComponent(symbol)}&f=sd2t2ohlcv&h&e=csv`);
  const text = await response.text();
  const parsed = parseStooqCsvLine(text);
  if (!parsed) throw new Error(`Stooq sin datos para ${symbol}`);
  return { value: parsed.value, updatedAt: parsed.timestamp };
}

async function fetchCoinGeckoBase() {
  const response = await fetchWithTimeout(
    "https://api.coingecko.com/api/v3/simple/price?ids=stellar,tether&vs_currencies=usd&include_last_updated_at=true",
  );
  const payload = (await response.json()) as {
    stellar?: { usd?: number; last_updated_at?: number };
    tether?: { usd?: number; last_updated_at?: number };
  };
  const stellar = payload.stellar?.usd;
  const tether = payload.tether?.usd;
  if (!Number.isFinite(stellar) || !Number.isFinite(tether)) {
    throw new Error("CoinGecko sin precios de Stellar/Tether.");
  }
  const updatedAtUnix = Math.max(payload.stellar?.last_updated_at ?? 0, payload.tether?.last_updated_at ?? 0);
  return {
    xlmUsd: Number(stellar),
    usdtUsd: Number(tether),
    updatedAt: updatedAtUnix > 0 ? new Date(updatedAtUnix * 1000).toISOString() : new Date().toISOString(),
  };
}

function buildFeed(id: OracleFeedId, value: number, updatedAt: string, source: OracleSource): OracleFeed {
  return {
    id,
    label: feedMeta[id].label,
    symbol: feedMeta[id].symbol,
    value: toRounded(value),
    unit: feedMeta[id].unit,
    updatedAt,
    source,
  };
}

function getFeedValue(feeds: Map<OracleFeedId, OracleFeed>, id: OracleFeedId, fallback: number) {
  const row = feeds.get(id);
  return row ? row.value : fallback;
}

function buildMarketIndex(category: AssetCategory, feeds: Map<OracleFeedId, OracleFeed>) {
  if (category === "cultivo") {
    const wheat = getFeedValue(feeds, "wheat_futures", baselineIndexValues.wheat_futures);
    const corn = getFeedValue(feeds, "corn_futures", baselineIndexValues.corn_futures);
    const soybean = getFeedValue(feeds, "soybean_futures", baselineIndexValues.soybean_futures);
    const raw = (wheat / baselineIndexValues.wheat_futures) * 0.4
      + (corn / baselineIndexValues.corn_futures) * 0.3
      + (soybean / baselineIndexValues.soybean_futures) * 0.3;
    return clamp(raw, 0.55, 1.75);
  }
  if (category === "tierra") {
    const vnq = getFeedValue(feeds, "vnq_reit", baselineIndexValues.vnq_reit);
    return clamp(vnq / baselineIndexValues.vnq_reit, 0.55, 1.75);
  }
  const cattle = getFeedValue(feeds, "live_cattle_futures", baselineIndexValues.live_cattle_futures);
  return clamp(cattle / baselineIndexValues.live_cattle_futures, 0.55, 1.75);
}

function getCategoryFeedIds(category: AssetCategory): OracleFeedId[] {
  if (category === "cultivo") {
    return ["wheat_futures", "corn_futures", "soybean_futures", "xlm_usd", "usdt_usd"];
  }
  if (category === "tierra") {
    return ["vnq_reit", "xlm_usd", "usdt_usd"];
  }
  return ["live_cattle_futures", "xlm_usd", "usdt_usd"];
}

export async function getOracleSnapshot(category: AssetCategory, location?: string): Promise<OracleSnapshot> {
  const cacheKey = `${category}::${(location ?? "").trim().toLowerCase()}`;
  const now = Date.now();
  if (oracleCache && oracleCache.expiresAt > now) {
    const cached = oracleCache.byKey[cacheKey];
    if (cached) return cached;
  }

  const notes: string[] = [];
  const feedsById = new Map<OracleFeedId, OracleFeed>();

  const defaultNow = new Date().toISOString();
  try {
    const base = await fetchCoinGeckoBase();
    feedsById.set("xlm_usd", buildFeed("xlm_usd", base.xlmUsd, base.updatedAt, "coingecko"));
    feedsById.set("usdt_usd", buildFeed("usdt_usd", base.usdtUsd, base.updatedAt, "coingecko"));
  } catch {
    notes.push("No se pudo consultar CoinGecko; se usan referencias fallback para XLM/USDT.");
    feedsById.set("xlm_usd", buildFeed("xlm_usd", 0.16, defaultNow, "fallback"));
    feedsById.set("usdt_usd", buildFeed("usdt_usd", 1, defaultNow, "fallback"));
  }

  const stooqSymbols: Array<{ id: OracleFeedId; symbol: string; fallback: number }> = [
    { id: "wheat_futures", symbol: "zw.f", fallback: baselineIndexValues.wheat_futures },
    { id: "corn_futures", symbol: "zc.f", fallback: baselineIndexValues.corn_futures },
    { id: "soybean_futures", symbol: "zs.f", fallback: baselineIndexValues.soybean_futures },
    { id: "live_cattle_futures", symbol: "le.f", fallback: baselineIndexValues.live_cattle_futures },
    { id: "vnq_reit", symbol: "vnq.us", fallback: baselineIndexValues.vnq_reit },
  ];

  await Promise.all(stooqSymbols.map(async (row) => {
    try {
      const result = await fetchStooqFeed(row.symbol);
      feedsById.set(row.id, buildFeed(row.id, result.value, result.updatedAt, "stooq"));
    } catch {
      notes.push(`Sin dato en vivo para ${feedMeta[row.id].symbol}; se usa valor fallback.`);
      feedsById.set(row.id, buildFeed(row.id, row.fallback, defaultNow, "fallback"));
    }
  }));

  const marketIndex = buildMarketIndex(category, feedsById);
  const locationFactorInput = getLocationFactor(location);
  const basePriceUsdt = toRounded(categoryBasePrice[category]);
  const suggestedTokenPriceUsdt = toRounded(Math.max(0.01, basePriceUsdt * marketIndex * locationFactorInput.factor));
  const selectedFeedIds = getCategoryFeedIds(category);
  const feeds = selectedFeedIds.map((id) => feedsById.get(id)).filter((item): item is OracleFeed => Boolean(item));
  const stale = feeds.some((item) => item.source === "fallback");

  const attestation = await buildAttestation({
    generatedAt: defaultNow,
    category,
    suggestedTokenPriceUsdt,
    basePriceUsdt,
    marketIndex: toRounded(marketIndex),
    locationFactor: toRounded(locationFactorInput.factor),
    feeds: feeds.map((feed) => ({
      id: feed.id,
      value: feed.value,
      source: feed.source,
      updatedAt: feed.updatedAt,
    })),
  });

  const snapshot: OracleSnapshot = {
    generatedAt: defaultNow,
    category,
    categoryLabel: categoryLabelMap[category],
    basePriceUsdt,
    suggestedTokenPriceUsdt,
    marketIndex: toRounded(marketIndex),
    locationFactor: toRounded(locationFactorInput.factor),
    feeds,
    stale,
    notes: [
      ...notes,
      `Pais inferido: ${locationFactorInput.code}.`,
      "Formula: precio_base_categoria x indice_mercado x factor_ubicacion.",
    ],
    attestation,
  };

  const byKey: Record<string, OracleSnapshot> = oracleCache?.byKey ?? {};
  byKey[cacheKey] = snapshot;
  oracleCache = {
    expiresAt: now + CACHE_TTL_MS,
    byKey,
  };

  return snapshot;
}

function normalizeText(value: string, maxLen: number) {
  return value.trim().replace(/\s+/g, " ").slice(0, maxLen);
}

function normalizeList(values: string[], maxLen: number) {
  return values
    .map((item) => normalizeText(item, maxLen))
    .filter(Boolean)
    .sort();
}

export async function verifyAssetEvidence(input: AssetVerificationInput): Promise<AssetVerificationReport> {
  const generatedAt = new Date().toISOString();
  const title = normalizeText(input.title, 200);
  const location = normalizeText(input.location, 200);
  const description = normalizeText(input.description, 1200);
  const mediaUrls = normalizeList(input.mediaUrls, 500);
  const externalRefs = normalizeList(input.externalRefs ?? [], 250);
  const declaredProofHash = normalizeText(input.declaredProofHash ?? "", 200).toLowerCase();

  const evidencePayload = {
    generatedAt,
    title,
    category: input.category,
    location,
    description,
    mediaUrls,
    externalRefs,
  };
  const evidenceHash = hashSha256Hex(JSON.stringify(evidencePayload));
  const declaredHashMatchesEvidence = declaredProofHash.length > 0 && declaredProofHash === evidenceHash;

  const landRegistry = await verifyLandRegistry({
    location,
    title,
    description,
    externalRefs,
  });

  const checks = [
    { id: "title", ok: title.length >= 6, message: "Titulo con longitud minima." },
    { id: "location", ok: location.length >= 3, message: "Ubicacion declarada." },
    { id: "description", ok: description.length >= 40, message: "Descripcion suficiente." },
    { id: "media", ok: mediaUrls.length > 0, message: "Soporte multimedia adjunto." },
    { id: "declared_hash", ok: declaredProofHash.length > 0, message: "Hash documental declarado." },
    {
      id: "declared_hash_match",
      ok: declaredHashMatchesEvidence,
      message: "Hash declarado coincide con hash de evidencia canonica.",
    },
    { id: "external_refs", ok: externalRefs.length > 0, message: "Referencias externas declaradas." },
    {
      id: "land_registry",
      ok: landRegistry.status === "verified" || landRegistry.status === "pending",
      message: `Registro catastral (${landRegistry.countryCode}): ${landRegistry.status}. ${landRegistry.message}`,
    },
  ];

  const structuralIntegrity = (checks.filter((row) => row.ok).length / checks.length) * 100;
  const integrityScore = Math.round((structuralIntegrity * 0.75) + (landRegistry.score * 0.25));
  const dataQualityScore = Math.round(((
    (title.length >= 6 ? 1 : 0)
    + (location.length >= 3 ? 1 : 0)
    + (description.length >= 40 ? 1 : 0)
    + (mediaUrls.length > 0 ? 1 : 0)
    + (externalRefs.length > 0 ? 1 : 0)
  ) / 5) * 100);

  const verdict = integrityScore >= 80
    && landRegistry.status === "verified"
    ? "verified_evidence"
    : integrityScore >= 50
      ? "partial_evidence"
      : "insufficient_evidence";

  const attestation = await buildAttestation({
    generatedAt,
    evidenceHash,
    category: input.category,
    integrityScore,
    dataQualityScore,
    verdict,
  });

  return {
    generatedAt,
    evidenceHash,
    declaredProofHash,
    declaredHashMatchesEvidence,
    integrityScore,
    dataQualityScore,
    verdict,
    landRegistry,
    checks,
    attestation,
  };
}

export async function verifyAnchorOnChain(input: {
  txHash: string;
  digest: string;
  network: "testnet" | "public";
}) {
  const digestBytes = Buffer.from(input.digest, "hex");
  if (digestBytes.length !== 32) {
    return { ok: false as const, message: "Digest invalido para memo hash (32 bytes)." };
  }

  const horizonUrl = getHorizonUrl(input.network);
  const [txRes, opsRes] = await Promise.all([
    fetch(`${horizonUrl}/transactions/${input.txHash}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    }),
    fetch(`${horizonUrl}/transactions/${input.txHash}/operations?limit=200&order=asc`, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    }),
  ]);

  if (!txRes.ok || !opsRes.ok) {
    return { ok: false as const, message: "No se pudo consultar la transaccion en Horizon." };
  }

  const tx = (await txRes.json()) as { successful?: boolean; memo_type?: string; memo?: string };
  if (!tx.successful) {
    return { ok: false as const, message: "La transaccion no figura como exitosa." };
  }

  const memoMatches = tx.memo_type === "hash" && typeof tx.memo === "string" && Buffer.from(tx.memo, "base64").equals(digestBytes);
  const ops = (await opsRes.json()) as {
    _embedded?: {
      records?: Array<{
        type?: string;
        name?: string;
        value?: string;
      }>;
    };
  };
  const records = ops._embedded?.records ?? [];
  const manageDataMatch = records.some((row) => (
    row.type === "manage_data"
    && row.name === ORACLE_ANCHOR_NAME
    && typeof row.value === "string"
    && Buffer.from(row.value, "base64").equals(digestBytes)
  ));

  if (!memoMatches && !manageDataMatch) {
    return { ok: false as const, message: "El digest no coincide con memo hash ni manage_data de la transaccion." };
  }

  return {
    ok: true as const,
    memoMatches,
    manageDataMatch,
  };
}
