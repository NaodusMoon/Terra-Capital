import { isValidStellarPublicKey } from "@/lib/security";
import type { StellarNetwork } from "@/lib/stellar";
import { signWalletTransactionXdr, type WalletProviderId } from "@/lib/wallet";

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

async function executeWalletPayment(input: ExecutePaymentInput) {
  const prepared = await prepareUnsignedPayment({
    sourceAddress: input.sourceAddress,
    destinationAddress: input.destinationAddress,
    amount: input.amount,
    network: input.network,
  });

  const signed = await signWalletTransactionXdr({
    wallet: { address: input.sourceAddress, provider: input.provider },
    unsignedTxXdr: prepared.unsignedTxXdr,
    networkPassphrase: prepared.networkPassphrase,
  });
  if (!signed.ok) {
    throw new Error(signed.message);
  }

  return submitSignedPayment(signed.signedTxXdr, input.network);
}

export async function executeMarketplacePayment(input: ExecutePaymentInput) {
  if (!isValidStellarPublicKey(input.sourceAddress) || !isValidStellarPublicKey(input.destinationAddress)) {
    return { ok: false as const, message: "Wallet origen o destino invalida." };
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false as const, message: "Monto de pago invalido." };
  }
  try {
    const txHash = await executeWalletPayment(input);
    return { ok: true as const, txHash };
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "No se pudo completar el pago en Stellar.",
    };
  }
}
