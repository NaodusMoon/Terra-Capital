import type { AssetCategory } from "@/types/market";

export interface OracleFeedRow {
  id: string;
  label: string;
  symbol: string;
  value: number;
  unit: string;
  updatedAt: string;
  source: "coingecko" | "stooq" | "fallback";
}

export interface OracleSnapshot {
  generatedAt: string;
  category: AssetCategory;
  categoryLabel: string;
  basePriceUsdt: number;
  suggestedTokenPriceUsdt: number;
  marketIndex: number;
  locationFactor: number;
  feeds: OracleFeedRow[];
  stale: boolean;
  notes: string[];
  attestation: {
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
  };
}

export interface AssetVerificationReport {
  generatedAt: string;
  evidenceHash: string;
  declaredProofHash: string;
  declaredHashMatchesEvidence: boolean;
  integrityScore: number;
  dataQualityScore: number;
  verdict: "verified_evidence" | "partial_evidence" | "insufficient_evidence";
  landRegistry: {
    countryCode: string;
    provider: string;
    status: "verified" | "pending" | "rejected" | "unavailable";
    score: number;
    message: string;
    checkedAt: string;
    referenceId: string | null;
  };
  checks: Array<{ id: string; ok: boolean; message: string }>;
  attestation: OracleSnapshot["attestation"];
}

export async function fetchOracleSnapshot(category: AssetCategory, location?: string) {
  const params = new URLSearchParams({ category });
  if (location?.trim()) params.set("location", location.trim());
  const response = await fetch(`/api/oracle/market?${params.toString()}`, {
    method: "GET",
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    message?: string;
    snapshot?: OracleSnapshot;
  } | null;

  if (!response.ok || !payload?.ok || !payload.snapshot) {
    throw new Error(payload?.message ?? "No se pudo cargar el oraculo.");
  }

  return payload.snapshot;
}

export async function verifyAssetEvidence(input: {
  title: string;
  category: AssetCategory;
  location: string;
  description: string;
  mediaUrls: string[];
  declaredProofHash?: string;
  externalRefs?: string[];
}) {
  const response = await fetch("/api/oracle/asset-verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    message?: string;
    report?: AssetVerificationReport;
  } | null;

  if (!response.ok || !payload?.ok || !payload.report) {
    throw new Error(payload?.message ?? "No se pudo verificar la evidencia del activo.");
  }

  return payload.report;
}

export async function verifyOracleAnchor(input: {
  txHash: string;
  digest: string;
  network: "testnet" | "public";
}) {
  const params = new URLSearchParams({
    txHash: input.txHash,
    digest: input.digest,
    network: input.network,
  });
  const response = await fetch(`/api/oracle/anchor-verify?${params.toString()}`, {
    method: "GET",
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    message?: string;
    memoMatches?: boolean;
    manageDataMatch?: boolean;
  } | null;
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message ?? "No se pudo verificar anclaje on-chain.");
  }
  return {
    memoMatches: Boolean(payload.memoMatches),
    manageDataMatch: Boolean(payload.manageDataMatch),
  };
}
