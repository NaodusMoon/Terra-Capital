import { NextResponse } from "next/server";
import { Asset, Horizon, Networks, Operation, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { isValidStellarPublicKey } from "@/lib/security";
import { enforceRateLimit, isTrustedOrigin, parseJsonWithLimit } from "@/lib/server/request-security";

export const runtime = "nodejs";

type StellarNetwork = "testnet" | "public";

const HORIZON_URLS: Record<StellarNetwork, string> = {
  testnet: "https://horizon-testnet.stellar.org",
  public: "https://horizon.stellar.org",
};

const NETWORK_PASSPHRASES: Record<StellarNetwork, string> = {
  testnet: Networks.TESTNET,
  public: Networks.PUBLIC,
};

function parseNetwork(value: unknown): StellarNetwork | null {
  if (value === "public") return "public";
  if (value === "testnet") return "testnet";
  return null;
}

function formatPaymentAmount(value: number) {
  return value.toFixed(7);
}

export async function POST(request: Request) {
  if (!isTrustedOrigin(request)) {
    return NextResponse.json({ ok: false, message: "Origen no permitido." }, { status: 403 });
  }
  const rate = enforceRateLimit({
    request,
    key: "api_stellar_payment_post",
    max: 40,
    windowMs: 60 * 1000,
  });
  if (!rate.ok) {
    return NextResponse.json({ ok: false, message: "Demasiadas solicitudes. Intenta nuevamente." }, { status: 429 });
  }

  type PaymentPayload = {
    action?: "prepare" | "submit";
    network?: unknown;
    source?: unknown;
    destination?: unknown;
    amount?: unknown;
    signedTxXdr?: unknown;
  };
  const parsed = await parseJsonWithLimit<PaymentPayload>(request, 200_000);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, message: parsed.message }, { status: parsed.status });
  }
  const payload = parsed.data;

  const network = parseNetwork(payload.network);
  if (!network) {
    return NextResponse.json({ ok: false, message: "Red Stellar invalida." }, { status: 400 });
  }

  try {
    const server = new Horizon.Server(HORIZON_URLS[network]);
    const networkPassphrase = NETWORK_PASSPHRASES[network];

    if (payload.action === "prepare") {
      const source = typeof payload.source === "string" ? payload.source.trim() : "";
      const destination = typeof payload.destination === "string" ? payload.destination.trim() : "";
      const amount = Number(payload.amount);

      if (!isValidStellarPublicKey(source) || !isValidStellarPublicKey(destination)) {
        return NextResponse.json({ ok: false, message: "Direcciones Stellar invalidas." }, { status: 400 });
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json({ ok: false, message: "Monto invalido." }, { status: 400 });
      }
      if (amount > 1000000000) {
        return NextResponse.json({ ok: false, message: "Monto excede limite permitido." }, { status: 400 });
      }

      const account = await server.loadAccount(source);
      const baseFee = await server.fetchBaseFee();
      const tx = new TransactionBuilder(account, {
        fee: String(baseFee),
        networkPassphrase,
      })
        .addOperation(
          Operation.payment({
            destination,
            amount: formatPaymentAmount(amount),
            asset: Asset.native(),
          }),
        )
        .setTimeout(120)
        .build();

      return NextResponse.json({
        ok: true,
        data: {
          network,
          networkPassphrase,
          unsignedTxXdr: tx.toXDR(),
          amount: formatPaymentAmount(amount),
        },
      });
    }

    if (payload.action === "submit") {
      const signedTxXdr = typeof payload.signedTxXdr === "string" ? payload.signedTxXdr.trim() : "";
      if (!signedTxXdr) {
        return NextResponse.json({ ok: false, message: "signedTxXdr es requerido." }, { status: 400 });
      }

      const tx = TransactionBuilder.fromXDR(signedTxXdr, networkPassphrase) as Transaction;
      const result = await server.submitTransaction(tx);
      return NextResponse.json({
        ok: true,
        data: {
          hash: result.hash,
          ledger: result.ledger,
        },
      });
    }

    return NextResponse.json({ ok: false, message: "Accion no soportada." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Error de red Stellar." },
      { status: 502 },
    );
  }
}
