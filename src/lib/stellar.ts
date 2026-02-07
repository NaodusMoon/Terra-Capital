import { TERRA_ASSET_CODES } from "@/lib/constants";

export type StellarNetwork = "testnet" | "public";

const HORIZON_URLS: Record<StellarNetwork, string> = {
  testnet: "https://horizon-testnet.stellar.org",
  public: "https://horizon.stellar.org",
};

export function getHorizonUrl(network: StellarNetwork) {
  return HORIZON_URLS[network];
}

export async function getNetworkHealth(network: StellarNetwork = "testnet") {
  const response = await fetch(getHorizonUrl(network), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Horizon error: ${response.status}`);
  }

  const root = (await response.json()) as {
    horizon_version: string;
    core_version: string;
    current_protocol_version: number;
    history_latest_ledger: number;
  };

  return {
    network,
    horizonVersion: root.horizon_version,
    coreVersion: root.core_version,
    currentProtocolVersion: root.current_protocol_version,
    historyLatestLedger: root.history_latest_ledger,
  };
}

export function buildTerraAssets(issuerPublicKey: string) {
  return TERRA_ASSET_CODES.map((code) => ({ code, issuer: issuerPublicKey }));
}

export interface WalletBalance {
  asset: string;
  amount: string;
}

export async function getWalletBalances(address: string, network: StellarNetwork = "testnet") {
  const response = await fetch(`${getHorizonUrl(network)}/accounts/${address}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`No se pudo consultar balance (${response.status}).`);
  }

  const payload = (await response.json()) as {
    balances: Array<{
      balance: string;
      asset_type: string;
      asset_code?: string;
    }>;
  };

  return payload.balances.map((row) => ({
    asset: row.asset_type === "native" ? "XLM" : (row.asset_code ?? "ASSET"),
    amount: row.balance,
  }));
}

