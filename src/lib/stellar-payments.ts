import albedo from "@albedo-link/intent";
import { signTransaction } from "@stellar/freighter-api";
import { isValidStellarPublicKey } from "@/lib/security";
import type { StellarNetwork } from "@/lib/stellar";
import type { WalletProviderId } from "@/lib/wallet";

interface PreparePayload {
  ok: boolean;
  message?: string;
  data?: {
    network: StellarNetwork;
    networkPassphrase: string;
    unsignedTxXdr: string;
    amount: string;
  };
}

interface SubmitPayload {
  ok: boolean;
  message?: string;
  data?: {
    hash: string;
    ledger?: number;
  };
}

interface ExecutePaymentInput {
  provider: WalletProviderId;
  sourceAddress: string;
  destinationAddress: string;
  amount: number;
  network: StellarNetwork;
}

function getAlbedoNetwork(network: StellarNetwork) {
  return network === "public" ? "public" : "testnet";
}

async function prepareUnsignedPayment(input: {
  sourceAddress: string;
  destinationAddress: string;
  amount: number;
  network: StellarNetwork;
}) {
  const response = await fetch("/api/stellar/payment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "prepare",
      source: input.sourceAddress,
      destination: input.destinationAddress,
      amount: input.amount,
      network: input.network,
    }),
  });
  const payload = (await response.json()) as PreparePayload;
  if (!response.ok || !payload.ok || !payload.data) {
    throw new Error(payload.message ?? "No se pudo preparar la transaccion Stellar.");
  }
  return payload.data;
}

async function submitSignedPayment(signedTxXdr: string, network: StellarNetwork) {
  const response = await fetch("/api/stellar/payment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "submit",
      signedTxXdr,
      network,
    }),
  });
  const payload = (await response.json()) as SubmitPayload;
  if (!response.ok || !payload.ok || !payload.data?.hash) {
    throw new Error(payload.message ?? "No se pudo enviar la transaccion a Stellar.");
  }
  return payload.data.hash;
}

async function executeFreighterPayment(input: ExecutePaymentInput) {
  const prepared = await prepareUnsignedPayment({
    sourceAddress: input.sourceAddress,
    destinationAddress: input.destinationAddress,
    amount: input.amount,
    network: input.network,
  });
  const signed = await signTransaction(prepared.unsignedTxXdr, {
    address: input.sourceAddress,
    networkPassphrase: prepared.networkPassphrase,
  });
  if (signed.error || !signed.signedTxXdr) {
    throw new Error(signed.error?.message ?? "No se pudo firmar la transaccion en Freighter.");
  }
  const hash = await submitSignedPayment(signed.signedTxXdr, input.network);
  return hash;
}

async function executeAlbedoPayment(input: ExecutePaymentInput) {
  const prepared = await prepareUnsignedPayment({
    sourceAddress: input.sourceAddress,
    destinationAddress: input.destinationAddress,
    amount: input.amount,
    network: input.network,
  });
  const result = await albedo.tx({
    xdr: prepared.unsignedTxXdr,
    pubkey: input.sourceAddress,
    network: getAlbedoNetwork(input.network),
    submit: true,
  });
  if (!result.tx_hash) {
    throw new Error("Albedo no devolvio hash de transaccion.");
  }
  return result.tx_hash;
}

export async function executeMarketplacePayment(input: ExecutePaymentInput) {
  if (!isValidStellarPublicKey(input.sourceAddress) || !isValidStellarPublicKey(input.destinationAddress)) {
    return { ok: false as const, message: "Wallet origen o destino invalida." };
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false as const, message: "Monto de pago invalido." };
  }
  try {
    if (input.provider === "freighter") {
      const txHash = await executeFreighterPayment(input);
      return { ok: true as const, txHash };
    }
    if (input.provider === "albedo") {
      const txHash = await executeAlbedoPayment(input);
      return { ok: true as const, txHash };
    }
    if (input.provider === "xbull") {
      return { ok: false as const, message: "xBull conectado, pero firma de transacciones aun no implementada en esta app." };
    }
    return { ok: false as const, message: "Debes conectar una wallet compatible (Freighter o Albedo)." };
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "No se pudo completar el pago en Stellar.",
    };
  }
}
